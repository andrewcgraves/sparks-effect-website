import { newTraceId } from './traceId'
import type { ChainResponse } from '../fixtures/isochrone'

/**
 * One already-plotted isochrone a seeded scenario ships with, as the list
 * endpoint reports it: the metadata only. The chain itself is 300–500KB, so a
 * scenario's whole list would be megabytes if the payloads came along — the
 * list names them, and the detail endpoint below serves the one that is asked
 * for.
 *
 * `outdated` means the scenario's routes or services have moved on since this
 * was plotted. It is still worth showing — it is a real answer, plotted from a
 * real graph — so the flag is presented rather than acted on.
 */
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

/** A pre-rendered isochrone with the chain it was plotted as. */
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
