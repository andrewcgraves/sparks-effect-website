export interface GeocodingSuggestion {
  label: string
  lat: number
  lng: number
}

const BASE_URL =
  import.meta.env.VITE_GEOCODING_BASE_URL ?? 'https://api.stadiamaps.com/geocoding/v1'
const API_KEY = import.meta.env.VITE_GEOCODING_API_KEY ?? ''

export async function fetchSuggestions(query: string): Promise<GeocodingSuggestion[]> {
  if (!query.trim()) return []

  const url = new URL(`${BASE_URL}/autocomplete`)
  url.searchParams.set('text', query)
  if (API_KEY) url.searchParams.set('api_key', API_KEY)

  try {
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
  } catch {
    return []
  }
}
