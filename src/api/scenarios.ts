import { listRoutes } from './authoring/routes'
import { newTraceId } from './traceId'

export type Provenance = 'computed' | 'calibrated' | 'frozen'

export interface Route {
  id: string
  scenario_id: string
  name: string
  mode: string
  geometry: { type: 'LineString'; coordinates: number[][] }
  bidirectional: boolean
}

export interface Station {
  id: string
  scenario_id: string
  slug: string
  name: string
  location: { type: 'Point'; coordinates: [number, number] }
  platform_height: string
}

export interface VehicleTypeSummary {
  id: string
  name: string
  propulsion: string
  max_speed_kmh: number
}

export interface FrequencyWindow {
  id: string
  service_id: string
  start_time: string
  end_time: string
  headway_s: number
}

export interface Service {
  id: string
  route_id?: string
  name: string
  vehicle_type: VehicleTypeSummary
  direction: string
  provenance: Provenance
  stop_count: number
  frequency_windows: FrequencyWindow[]
}

export interface SegmentTime {
  from: string
  to: string
  run_seconds: number
  reverse_run_seconds?: number
  route_id?: string
}

export interface TravelTimes {
  scenario_slug: string
  provenance: Provenance
  source: string
  segments: SegmentTime[]
}

export interface ScenarioDetail {
  id: string
  slug: string
  name: string
  description: string
  status: string
  routes: Route[]
  stations: Station[]
  services: Service[]
}

function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
}

export async function fetchScenario(scenarioSlug: string): Promise<ScenarioDetail> {
  const res = await fetch(`${apiBase()}/api/scenarios/${scenarioSlug}`, {
    headers: { 'X-Trace-Id': newTraceId() },
  })
  if (!res.ok) throw new Error(`Failed to fetch scenario ${scenarioSlug}: ${res.status}`)
  return res.json() as Promise<ScenarioDetail>
}

export async function fetchScenarioTravelTimes(scenarioSlug: string): Promise<TravelTimes> {
  const res = await fetch(`${apiBase()}/api/scenarios/${scenarioSlug}/travel-times`, {
    headers: { 'X-Trace-Id': newTraceId() },
  })
  if (!res.ok) throw new Error(`Failed to fetch travel times for ${scenarioSlug}: ${res.status}`)
  return res.json() as Promise<TravelTimes>
}

export interface ScenarioSummary {
  slug: string
  name: string
  description: string
}

export const FEATURED_SCENARIO_SLUGS = ['ca-hsr']

export async function fetchFeaturedScenarios(): Promise<ScenarioSummary[]> {
  const routeSlugs = await listRoutes().then((routes) => routes.map((route) => route.slug)).catch(() => [])
  const slugs = Array.from(new Set([...FEATURED_SCENARIO_SLUGS, ...routeSlugs]))

  const results = await Promise.allSettled(slugs.map((slug) => fetchScenario(slug)))
  return results
    .filter((result): result is PromiseFulfilledResult<ScenarioDetail> => result.status === 'fulfilled')
    .map(({ value }) => ({ slug: value.slug, name: value.name, description: value.description }))
}
