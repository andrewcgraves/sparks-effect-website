export interface GeocodingSuggestion {
  label: string
  lat: number
  lng: number
}

const STADIA_BASE =
  import.meta.env.VITE_GEOCODING_BASE_URL ?? 'https://api.stadiamaps.com/geocoding/v1'
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'

async function fetchFromStadia(query: string, apiKey: string): Promise<GeocodingSuggestion[]> {
  const url = new URL(`${STADIA_BASE}/autocomplete`)
  url.searchParams.set('text', query)
  url.searchParams.set('api_key', apiKey)

  const response = await fetch(url.toString())
  if (!response.ok) return []

  const data = await response.json()
  return (data.features ?? []).map(
    (feature: {
      properties: { label: string }
      geometry: { coordinates: [number, number] }
    }): GeocodingSuggestion => ({
      label: feature.properties.label,
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
    }),
  )
}

async function fetchFromNominatim(query: string): Promise<GeocodingSuggestion[]> {
  const userAgent = import.meta.env.VITE_GEOCODING_USER_AGENT ?? 'sparks-effect-app/1.0'
  const url = new URL(`${NOMINATIM_BASE}/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': userAgent },
  })
  if (!response.ok) return []

  const data: Array<{ display_name: string; lat: string; lon: string }> = await response.json()
  return data.map((place) => ({
    label: place.display_name,
    lat: parseFloat(place.lat),
    lng: parseFloat(place.lon),
  }))
}

export async function fetchSuggestions(query: string): Promise<GeocodingSuggestion[]> {
  if (!query.trim()) return []
  const apiKey = import.meta.env.VITE_GEOCODING_API_KEY ?? ''
  try {
    if (apiKey) return await fetchFromStadia(query, apiKey)
    return await fetchFromNominatim(query)
  } catch {
    return []
  }
}
