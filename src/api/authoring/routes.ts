import { apiRequest } from './client'
import type { Route, RouteSummary, SnapStopInput, SnapStopsResponse } from './types'

// Enough to choose one, not the full geometry.
export async function listRoutes(): Promise<RouteSummary[]> {
  return apiRequest<RouteSummary[]>('/api/routes')
}

export async function fetchRoute(slug: string): Promise<Route> {
  return apiRequest<Route>(`/api/routes/${slug}`)
}

// Always 200s for a well-formed request — problems are flagged in the
// response, not rejected.
export async function snapStops(routeSlug: string, stops: SnapStopInput[]): Promise<SnapStopsResponse> {
  return apiRequest<SnapStopsResponse>(`/api/routes/${routeSlug}/snap-stops`, {
    method: 'POST',
    body: JSON.stringify({ stops }),
  })
}
