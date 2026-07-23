// User-scenario CRUD operations: curated lists of the caller's own service
// ids, at /api/user-scenarios. Distinct from the public, seeded /api/scenarios
// read (a different model entirely — see internal/handler/mine.go on the
// API), which this module does not touch.
import { apiRequest } from './client'
import type { Scenario, ScenarioInput } from './types'

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
