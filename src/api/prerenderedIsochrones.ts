import { apiRequest } from './authoring/client'
import type { ChainResponse } from '../fixtures/isochrone'

export interface PrerenderedIsochroneSummary {
  id: string
  label: string
  lat: number
  lng: number
  budget_mins: number
  mode: string
  outdated: boolean
  created_at: string
}

export interface PrerenderedIsochrone extends PrerenderedIsochroneSummary {
  result: ChainResponse
}

export function listPrerenderedIsochrones(
  scenarioSlug: string,
): Promise<PrerenderedIsochroneSummary[]> {
  return apiRequest<PrerenderedIsochroneSummary[]>(
    `/api/scenarios/${scenarioSlug}/prerendered-isochrones`,
  )
}

export function fetchPrerenderedIsochrone(id: string): Promise<PrerenderedIsochrone> {
  return apiRequest<PrerenderedIsochrone>(`/api/prerendered-isochrones/${id}`)
}
