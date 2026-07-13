import type { ChainResponse } from '../fixtures/isochrone'

export interface IsochroneRequest {
  lat: number
  lng: number
  budget_mins: number
  mode: 'walk' | 'bike' | 'drive'
  scenario_slug: string
}

export async function fetchIsochrone(request: IsochroneRequest): Promise<ChainResponse> {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
  const response = await fetch(`${base}/api/isochrone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(`Isochrone API error: ${response.status}`)
  }
  return response.json() as Promise<ChainResponse>
}
