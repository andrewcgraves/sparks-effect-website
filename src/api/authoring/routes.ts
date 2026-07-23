// Route read operations.
import { apiRequest } from './client'
import type { Route, RouteSummary, SnapStopInput, SnapStopsResponse } from './types'

// Lists routes for a picker: enough to choose one, not the full geometry.
export async function listRoutes(): Promise<RouteSummary[]> {
  return apiRequest<RouteSummary[]>('/api/routes')
}

// Fetches a computed route by slug.
export async function fetchRoute(slug: string): Promise<Route> {
  return apiRequest<Route>(`/api/routes/${slug}`)
}

// Previews where raw stop coordinates would land on a route: the snapped
// position, chainage, offset, and whether the authored order agrees with the
// order the stops fall in along the line. Always 200s for a well-formed
// request — problems are flagged in the response, not rejected.
export async function snapStops(routeSlug: string, stops: SnapStopInput[]): Promise<SnapStopsResponse> {
  return apiRequest<SnapStopsResponse>(`/api/routes/${routeSlug}/snap-stops`, {
    method: 'POST',
    body: JSON.stringify({ stops }),
  })
}
