import { apiRequest } from './client'
import type {
  OwnedRoute,
  OwnedRouteSummary,
  Route,
  RouteInput,
  RouteSummary,
  SnapStopInput,
  SnapStopsResponse,
} from './types'

export async function listRoutes(): Promise<RouteSummary[]> {
  return apiRequest<RouteSummary[]>('/api/routes')
}

export async function fetchRoute(slug: string): Promise<Route> {
  return apiRequest<Route>(`/api/routes/${slug}`)
}

export async function fetchMyRoutes(): Promise<OwnedRouteSummary[]> {
  return apiRequest<OwnedRouteSummary[]>('/api/me/routes')
}

export async function fetchMyRoute(slug: string): Promise<OwnedRoute> {
  return apiRequest<OwnedRoute>(`/api/me/routes/${slug}`)
}

export async function createRoute(input: RouteInput): Promise<Route> {
  return apiRequest<Route>('/api/me/routes', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateRoute(slug: string, input: RouteInput): Promise<Route> {
  return apiRequest<Route>(`/api/me/routes/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteRoute(slug: string): Promise<void> {
  await apiRequest<void>(`/api/me/routes/${slug}`, { method: 'DELETE' })
}

export async function snapStops(routeSlug: string, stops: SnapStopInput[]): Promise<SnapStopsResponse> {
  return apiRequest<SnapStopsResponse>(`/api/routes/${routeSlug}/snap-stops`, {
    method: 'POST',
    body: JSON.stringify({ stops }),
  })
}
