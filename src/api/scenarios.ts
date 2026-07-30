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
  name: string
  vehicle_type: VehicleTypeSummary
  direction: string
  provenance: Provenance
  stop_count: number
  frequency_windows: FrequencyWindow[]
}

// Run-time-only seconds for one adjacent station pair, stored in the service's
// own direction. Bidirectional services reuse the same time the other way.
export interface SegmentTime {
  from: string
  to: string
  run_seconds: number
}

// A seeded scenario's adjacent-segment run times. The full origin–destination
// matrix is deliberately not served; callers sum consecutive segments.
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
  const res = await fetch(`${apiBase()}/api/scenarios/${scenarioSlug}`)
  if (!res.ok) throw new Error(`Failed to fetch scenario ${scenarioSlug}: ${res.status}`)
  return res.json() as Promise<ScenarioDetail>
}

export async function fetchScenarioTravelTimes(scenarioSlug: string): Promise<TravelTimes> {
  const res = await fetch(`${apiBase()}/api/scenarios/${scenarioSlug}/travel-times`)
  if (!res.ok) throw new Error(`Failed to fetch travel times for ${scenarioSlug}: ${res.status}`)
  return res.json() as Promise<TravelTimes>
}

export interface ScenarioSummary {
  slug: string
  name: string
  description: string
}

// The seeded /api/scenarios read has no "list all"; feature the slugs we
// know about individually rather than adding a backend endpoint for this
// temporary home page.
export const FEATURED_SCENARIO_SLUGS = ['ca-hsr']

// Fetches each featured slug, silently omitting any that don't resolve
// (unpublished or not-yet-seeded) rather than failing the whole list.
export async function fetchFeaturedScenarios(): Promise<ScenarioSummary[]> {
  const results = await Promise.allSettled(FEATURED_SCENARIO_SLUGS.map((slug) => fetchScenario(slug)))
  return results
    .filter((result): result is PromiseFulfilledResult<ScenarioDetail> => result.status === 'fulfilled')
    .map(({ value }) => ({ slug: value.slug, name: value.name, description: value.description }))
}
