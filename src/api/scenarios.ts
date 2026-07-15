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
