export interface GeocodingSuggestion {
  label: string
  lat: number
  lng: number
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'

export async function fetchSuggestions(query: string): Promise<GeocodingSuggestion[]> {
  if (!query.trim()) return []
  const userAgent = import.meta.env.VITE_GEOCODING_USER_AGENT ?? 'sparks-effect-app/1.0'
  const url = new URL(`${NOMINATIM_BASE}/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')

  try {
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
  } catch {
    return []
  }
}
