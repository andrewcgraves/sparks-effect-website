import { apiRequest } from './client'
import type { Route, RouteSummary, SnapStopInput, SnapStopsResponse } from './types'

export async function listRoutes(): Promise<RouteSummary[]> {
  return apiRequest<RouteSummary[]>('/api/routes')
}

export async function fetchRoute(slug: string): Promise<Route> {
  return apiRequest<Route>(`/api/routes/${slug}`)
}

export async function snapStops(routeSlug: string, stops: SnapStopInput[]): Promise<SnapStopsResponse> {
  return apiRequest<SnapStopsResponse>(`/api/routes/${routeSlug}/snap-stops`, {
    method: 'POST',
    body: JSON.stringify({ stops }),
  })
}
