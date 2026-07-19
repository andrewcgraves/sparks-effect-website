// Route read operations.
import { apiRequest } from './client'
import type { Route } from './types'

// Fetches a computed route by slug.
export async function fetchRoute(slug: string): Promise<Route> {
  return apiRequest<Route>(`/api/routes/${slug}`)
}
