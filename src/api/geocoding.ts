export interface GeocodingSuggestion {
  label: string
  lat: number
  lng: number
}

export interface AddressMatch {
  label: string
  gid: string
}

interface StadiaFeature {
  geometry: { coordinates: [number, number] } | null
  properties: { gid: string; name?: string; coarse_location?: string }
}

export class GeocoderUnavailableError extends Error {
  readonly status?: number

  constructor(status?: number) {
    super(status ? `Geocoder responded ${status}` : 'Geocoder unreachable')
    this.name = 'GeocoderUnavailableError'
    this.status = status
  }
}

const STADIA_GEOCODING_BASE = 'https://api.stadiamaps.com/geocoding/v2'

// Every scenario lives in California or Nevada, so search no further.
const CA_NV_BOUNDS = { minLat: 32.5, minLon: -124.5, maxLat: 42.0, maxLon: -114.0 }

function stadiaUrl(endpoint: string, params: Record<string, string>): string {
  const url = new URL(`${STADIA_GEOCODING_BASE}/${endpoint}`)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  // Production deliberately has no key: Stadia authenticates sparks-effect.app
  // by its Origin. Only previews (and local reverse lookups) need one.
  const apiKey = (import.meta.env.VITE_STADIA_API_KEY as string | undefined)?.trim()
  if (apiKey) url.searchParams.set('api_key', apiKey)
  return url.toString()
}

// An outage, a rate limit and an exhausted free quota all mean the same thing
// to the user: no search. Fold them into one error so callers can say so, but
// let a cancelled request stay an AbortError so a superseded keystroke isn't
// mistaken for an outage.
async function stadiaFeatures(
  endpoint: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<StadiaFeature[]> {
  let response: Response
  try {
    response = await fetch(stadiaUrl(endpoint, params), { signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new GeocoderUnavailableError()
  }
  if (!response.ok) throw new GeocoderUnavailableError(response.status)
  let data: { features?: unknown }
  try {
    data = await response.json()
  } catch {
    throw new GeocoderUnavailableError(response.status)
  }
  if (!Array.isArray(data?.features)) throw new GeocoderUnavailableError(response.status)
  return data.features as StadiaFeature[]
}

function labelOf(feature: StadiaFeature): string {
  const { name, coarse_location } = feature.properties
  return [name, coarse_location].filter(Boolean).join(', ')
}

function coordinatesOf(feature: StadiaFeature | undefined): { lat: number; lng: number } | null {
  if (!feature?.geometry) return null
  const [lng, lat] = feature.geometry.coordinates
  return { lat, lng }
}

export async function fetchSuggestions(query: string, signal?: AbortSignal): Promise<AddressMatch[]> {
  if (!query.trim()) return []
  const features = await stadiaFeatures(
    'autocomplete',
    {
      text: query,
      size: '5',
      'boundary.country': 'US',
      'boundary.rect.min_lat': String(CA_NV_BOUNDS.minLat),
      'boundary.rect.min_lon': String(CA_NV_BOUNDS.minLon),
      'boundary.rect.max_lat': String(CA_NV_BOUNDS.maxLat),
      'boundary.rect.max_lon': String(CA_NV_BOUNDS.maxLon),
    },
    signal,
  )
  return features.map((feature) => ({ label: labelOf(feature), gid: feature.properties.gid }))
}

// Stadia's autocomplete returns no coordinates, so a match costs a second call,
// made only once the user picks it rather than for every row on every keystroke.
export async function lookupPlace(match: AddressMatch, signal?: AbortSignal): Promise<GeocodingSuggestion> {
  const [place] = await stadiaFeatures('place_details', { ids: match.gid }, signal)
  const point = coordinatesOf(place)
  if (!point) throw new GeocoderUnavailableError()
  return { label: match.label, ...point }
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingSuggestion | null> {
  try {
    const [place] = await stadiaFeatures('reverse', {
      'point.lat': String(lat),
      'point.lon': String(lng),
      size: '1',
    })
    const point = coordinatesOf(place)
    return point ? { label: labelOf(place), ...point } : null
  } catch {
    return null
  }
}
