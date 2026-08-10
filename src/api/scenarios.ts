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
  // The line this service runs over. Several services can share one — an
  // express and a local pattern are two services and one route — so this is
  // what to group by when presenting the network as lines. Optional: an API
  // older than SPA-223 does not report it, and a caller that needs it has to
  // cope with not being told.
  route_id?: string
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

// The seeded /api/scenarios read has no "list all"; always try this one even
// if listRoutes (below) comes back empty or fails.
export const FEATURED_SCENARIO_SLUGS = ['ca-hsr']

// Fetches every scenario worth featuring on the home page: the known slug(s)
// above, plus one per published route (/api/routes is public and unscoped,
// unlike the owner-scoped /api/user-scenarios). A route without a same-slug
// scenario just 404s and is dropped, same as any other unresolved slug.
export async function fetchFeaturedScenarios(): Promise<ScenarioSummary[]> {
  const routeSlugs = await listRoutes().then((routes) => routes.map((route) => route.slug)).catch(() => [])
  const slugs = Array.from(new Set([...FEATURED_SCENARIO_SLUGS, ...routeSlugs]))

  const results = await Promise.allSettled(slugs.map((slug) => fetchScenario(slug)))
  return results
    .filter((result): result is PromiseFulfilledResult<ScenarioDetail> => result.status === 'fulfilled')
    .map(({ value }) => ({ slug: value.slug, name: value.name, description: value.description }))
}
