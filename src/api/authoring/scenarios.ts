import { apiRequest } from './client'
import { enqueueIsochrone } from '../routingJobs'
import type { ChainResponse } from '../../fixtures/isochrone'
import type { Job, Scenario, ScenarioInput, TransitGraph, AuthoredIsochroneRequest } from './types'

export async function listScenarios(): Promise<Scenario[]> {
  return apiRequest<Scenario[]>('/api/user-scenarios')
}

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

export async function compileScenario(slug: string, init?: RequestInit): Promise<Job> {
  return apiRequest<Job>(`/api/user-scenarios/${slug}/compile`, { ...init, method: 'POST' })
}

export async function fetchScenarioGraph(slug: string): Promise<TransitGraph> {
  return apiRequest<TransitGraph>(`/api/user-scenarios/${slug}/graph`)
}

export function fetchScenarioIsochrone(
  slug: string,
  request: AuthoredIsochroneRequest,
): Promise<ChainResponse> {
  return enqueueIsochrone(`/api/user-scenarios/${slug}/isochrone`, request)
}
