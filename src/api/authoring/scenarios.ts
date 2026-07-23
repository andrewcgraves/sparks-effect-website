// User-scenario CRUD operations: curated lists of the caller's own service
// ids, at /api/user-scenarios. Distinct from the public, seeded /api/scenarios
// read (a different model entirely — see internal/handler/mine.go on the
// API), which this module does not touch.
import { apiRequest } from './client'
import type { ChainResponse } from '../../fixtures/isochrone'
import type { Job, Scenario, ScenarioInput, UserScenarioIsochroneRequest } from './types'

// Lists the signed-in user's own scenarios. There is no "all scenarios" read
// here: /api/user-scenarios is owner-scoped.
export async function listScenarios(): Promise<Scenario[]> {
  return apiRequest<Scenario[]>('/api/user-scenarios')
}

// Alias of listScenarios — kept as its own name because callers reach for
// "mine" alongside fetchMyServices.
export async function fetchMyScenarios(): Promise<Scenario[]> {
  return listScenarios()
}

// Fetches a single scenario by slug.
export async function fetchScenario(slug: string): Promise<Scenario> {
  return apiRequest<Scenario>(`/api/user-scenarios/${slug}`)
}

// Creates a new scenario.
export async function createScenario(input: ScenarioInput): Promise<Scenario> {
  return apiRequest<Scenario>('/api/user-scenarios', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// Updates an existing scenario by slug.
export async function updateScenario(slug: string, input: ScenarioInput): Promise<Scenario> {
  return apiRequest<Scenario>(`/api/user-scenarios/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

// Deletes a scenario by slug.
export async function deleteScenario(slug: string): Promise<void> {
  await apiRequest<void>(`/api/user-scenarios/${slug}`, { method: 'DELETE' })
}

// Triggers a compile of a scenario's member services into one connected
// graph. Returns the queued job immediately; poll it via fetchJob /
// pollJobToResult (or the jobs store's track) to reach the compiled graph.
export async function compileScenario(slug: string): Promise<Job> {
  return apiRequest<Job>(`/api/user-scenarios/${slug}/compile`, { method: 'POST' })
}

// Computes an isochrone over a scenario's latest compiled graph. Distinct
// from the seeded fetchIsochrone (api/isochrone.ts): owner-scoped, and
// resolves against user_scenarios rather than scenarios. A 409 whose
// ApiError.code is 'stale_graph' means the compiled graph fell behind an
// edit to a member service — the caller should recompile and retry.
export async function fetchScenarioIsochrone(
  slug: string,
  request: UserScenarioIsochroneRequest,
): Promise<ChainResponse> {
  return apiRequest<ChainResponse>(`/api/user-scenarios/${slug}/isochrone`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}
