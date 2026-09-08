import { newTraceId } from './traceId'
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

function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
}

export async function listPrerenderedIsochrones(
  scenarioSlug: string,
): Promise<PrerenderedIsochroneSummary[]> {
  const res = await fetch(`${apiBase()}/api/scenarios/${scenarioSlug}/prerendered-isochrones`, {
    headers: { 'X-Trace-Id': newTraceId() },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch pre-rendered isochrones for ${scenarioSlug}: ${res.status}`)
  }
  return res.json() as Promise<PrerenderedIsochroneSummary[]>
}

export async function fetchPrerenderedIsochrone(id: string): Promise<PrerenderedIsochrone> {
  const res = await fetch(`${apiBase()}/api/prerendered-isochrones/${id}`, {
    headers: { 'X-Trace-Id': newTraceId() },
  })
  if (!res.ok) throw new Error(`Failed to fetch pre-rendered isochrone ${id}: ${res.status}`)
  return res.json() as Promise<PrerenderedIsochrone>
}
