// Distinct from the public, seeded /api/scenarios read (a different model
// entirely — see internal/handler/mine.go on the API), which this module does
// not touch.
import { apiRequest } from './client'
import { enqueueIsochrone } from '../routingJobs'
import type { ChainResponse } from '../../fixtures/isochrone'
import type { Job, Scenario, ScenarioInput, TransitGraph, AuthoredIsochroneRequest } from './types'

// There is no "all scenarios" read here: /api/user-scenarios is owner-scoped.
export async function listScenarios(): Promise<Scenario[]> {
  return apiRequest<Scenario[]>('/api/user-scenarios')
}

// Alias of listScenarios — kept as its own name because callers reach for
// "mine" alongside fetchMyServices.
export async function fetchMyScenarios(): Promise<Scenario[]> {
  return listScenarios()
}

export async function fetchScenario(slug: string): Promise<Scenario> {
  return apiRequest<Scenario>(`/api/user-scenarios/${slug}`)
}

export async function createScenario(input: ScenarioInput): Promise<Scenario> {
  return apiRequest<Scenario>('/api/user-scenarios', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateScenario(slug: string, input: ScenarioInput): Promise<Scenario> {
  return apiRequest<Scenario>(`/api/user-scenarios/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteScenario(slug: string): Promise<void> {
  await apiRequest<void>(`/api/user-scenarios/${slug}`, { method: 'DELETE' })
}

// Returns the queued job immediately; poll it via fetchJob / pollJobToResult
// (or the jobs store's track) to reach the compiled graph.
//
// `init` is how useCompileJob reuses one X-Trace-Id across this POST and
// the polls that follow (SPA-205).
export async function compileScenario(slug: string, init?: RequestInit): Promise<Job> {
  return apiRequest<Job>(`/api/user-scenarios/${slug}/compile`, { ...init, method: 'POST' })
}

// 404s when the scenario has never compiled successfully — the caller's cue
// to fire compileScenario rather than an error to surface.
export async function fetchScenarioGraph(slug: string): Promise<TransitGraph> {
  return apiRequest<TransitGraph>(`/api/user-scenarios/${slug}/graph`)
}

// Distinct from the seeded fetchIsochrone (api/isochrone.ts): owner-scoped,
// and resolves against user_scenarios rather than scenarios. enqueueIsochrone
// owns the wait for the routing job the endpoint answers with.
//
// A 409 whose ApiError.code is 'stale_graph' means the compiled graph fell
// behind an edit to a member service — the caller should recompile and retry.
// The check runs before anything is enqueued, so it arrives from the POST.
export function fetchScenarioIsochrone(
  slug: string,
  request: AuthoredIsochroneRequest,
): Promise<ChainResponse> {
  return enqueueIsochrone(`/api/user-scenarios/${slug}/isochrone`, request)
}
