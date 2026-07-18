import type { ChainResponse } from '../fixtures/isochrone'

export interface IsochroneRequest {
  lat: number
  lng: number
  budget_mins: number
  mode: 'walk' | 'bike' | 'drive'
  scenario_slug: string
}

/**
 * Thrown when the isochrone API responds with a non-ok status. Carries the HTTP
 * status so callers can distinguish server rejections from connectivity failures
 * (which surface as the underlying fetch error, not an IsochroneApiError).
 */
export class IsochroneApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Isochrone API error: ${status}`)
    this.name = 'IsochroneApiError'
    this.status = status
  }
}

export async function fetchIsochrone(request: IsochroneRequest): Promise<ChainResponse> {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
  const response = await fetch(`${base}/api/isochrone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new IsochroneApiError(response.status)
  }
  return response.json() as Promise<ChainResponse>
}
