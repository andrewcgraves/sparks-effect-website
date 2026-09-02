// Service CRUD operations.
import { apiRequest } from './client'
import { enqueueIsochrone } from '../routingJobs'
import type { ChainResponse } from '../../fixtures/isochrone'
import type { AuthoredIsochroneRequest, Job, Service, ServiceInput, TransitGraph } from './types'

// Lists the signed-in user's own user-authored services. There is no "all
// services" read: /api/services is owner-scoped, same as the rest of this
// CRUD surface.
export async function listServices(): Promise<Service[]> {
  return apiRequest<Service[]>('/api/services')
}

// Alias of listServices — kept as its own name because callers reach for
// "mine" alongside fetchMyScenarios.
export async function fetchMyServices(): Promise<Service[]> {
  return listServices()
}

// Fetches a single service by slug.
export async function fetchService(slug: string): Promise<Service> {
  return apiRequest<Service>(`/api/services/${slug}`)
}

// Creates a new service.
export async function createService(input: ServiceInput): Promise<Service> {
  return apiRequest<Service>('/api/services', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// Updates an existing service by slug.
export async function updateService(slug: string, input: ServiceInput): Promise<Service> {
  return apiRequest<Service>(`/api/services/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

// Deletes a service by slug.
export async function deleteService(slug: string): Promise<void> {
  await apiRequest<void>(`/api/services/${slug}`, { method: 'DELETE' })
}

// Triggers a compile of a single service, degenerate as a one-member
// scenario. Returns the queued job immediately; poll it via fetchJob /
// pollJobToResult to reach the compiled TransitGraph.
//
// `init` is how useCompileJob reuses one X-Trace-Id across this POST and
// the polls that follow (SPA-205).
export async function compileService(slug: string, init?: RequestInit): Promise<Job> {
  return apiRequest<Job>(`/api/services/${slug}/compile`, { ...init, method: 'POST' })
}

// Reads a service's latest compiled graph without recompiling. 404s when the
// service has never compiled successfully — the caller's cue to fire
// compileService rather than an error to surface.
//
// Returns the same {...graph, routes: []} shape as fetchScenarioGraph, so the
// graph-to-map helpers in composables/scenarioGraphMap work against either.
export async function fetchServiceGraph(slug: string): Promise<TransitGraph> {
  return apiRequest<TransitGraph>(`/api/services/${slug}/graph`)
}

// Plots an isochrone over a service's latest compiled graph — the
// single-service counterpart to fetchScenarioIsochrone, for a service compiled
// alone rather than as a scenario member.
//
// A 409 whose ApiError.code is 'stale_graph' means the compiled graph fell
// behind an edit to the service itself; the caller should recompile and retry.
// The check runs before anything is enqueued, so it arrives from the POST.
export function fetchServiceIsochrone(
  slug: string,
  request: AuthoredIsochroneRequest,
): Promise<ChainResponse> {
  return enqueueIsochrone(`/api/services/${slug}/isochrone`, request)
}
