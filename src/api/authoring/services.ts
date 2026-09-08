import { apiRequest } from './client'
import { enqueueIsochrone } from '../routingJobs'
import type { ChainResponse } from '../../fixtures/isochrone'
import type { AuthoredIsochroneRequest, Job, Service, ServiceInput, TransitGraph } from './types'

// There is no "all services" read: /api/services is owner-scoped, same as the
// rest of this CRUD surface.
export async function listServices(): Promise<Service[]> {
  return apiRequest<Service[]>('/api/services')
}

// Alias of listServices — kept as its own name because callers reach for
// "mine" alongside fetchMyScenarios.
export async function fetchMyServices(): Promise<Service[]> {
  return listServices()
}

export async function fetchService(slug: string): Promise<Service> {
  return apiRequest<Service>(`/api/services/${slug}`)
}

export async function createService(input: ServiceInput): Promise<Service> {
  return apiRequest<Service>('/api/services', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateService(slug: string, input: ServiceInput): Promise<Service> {
  return apiRequest<Service>(`/api/services/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteService(slug: string): Promise<void> {
  await apiRequest<void>(`/api/services/${slug}`, { method: 'DELETE' })
}

// Degenerate as a one-member scenario.
//
// `init` is how useCompileJob reuses one X-Trace-Id across this POST and
// the polls that follow (SPA-205).
export async function compileService(slug: string, init?: RequestInit): Promise<Job> {
  return apiRequest<Job>(`/api/services/${slug}/compile`, { ...init, method: 'POST' })
}

// 404s when the service has never compiled successfully — the caller's cue to
// fire compileService rather than an error to surface.
//
// Returns the same {...graph, routes: []} shape as fetchScenarioGraph, so the
// graph-to-map helpers in composables/scenarioGraphMap work against either.
export async function fetchServiceGraph(slug: string): Promise<TransitGraph> {
  return apiRequest<TransitGraph>(`/api/services/${slug}/graph`)
}

// A 409 whose ApiError.code is 'stale_graph' means the compiled graph fell
// behind an edit to the service itself; the caller should recompile and retry.
// The check runs before anything is enqueued, so it arrives from the POST.
export function fetchServiceIsochrone(
  slug: string,
  request: AuthoredIsochroneRequest,
): Promise<ChainResponse> {
  return enqueueIsochrone(`/api/services/${slug}/isochrone`, request)
}
