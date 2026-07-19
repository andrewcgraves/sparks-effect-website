// Scenario CRUD operations (new authoring model — curated service ID lists).
import { apiRequest } from './client'
import type { Scenario, ScenarioInput } from './types'

// Lists all scenarios.
export async function listScenarios(): Promise<Scenario[]> {
  return apiRequest<Scenario[]>('/api/scenarios')
}

// Fetches a single scenario by slug.
export async function fetchScenario(slug: string): Promise<Scenario> {
  return apiRequest<Scenario>(`/api/scenarios/${slug}`)
}

// Creates a new scenario.
export async function createScenario(input: ScenarioInput): Promise<Scenario> {
  return apiRequest<Scenario>('/api/scenarios', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// Updates an existing scenario by slug.
export async function updateScenario(slug: string, input: ScenarioInput): Promise<Scenario> {
  return apiRequest<Scenario>(`/api/scenarios/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

// Deletes a scenario by slug.
export async function deleteScenario(slug: string): Promise<void> {
  await apiRequest<void>(`/api/scenarios/${slug}`, { method: 'DELETE' })
}
