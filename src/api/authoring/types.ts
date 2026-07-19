// Domain model for the authoring API (services, scenarios, routes, jobs).

// A single ordered stop along a service, carrying its own location inline.
export interface Stop {
  lat: number
  lng: number
  name: string
  seq: number
}

// User-defined vehicle physics used to simulate a service.
export interface VehicleParams {
  max_speed_kmh: number
  acceleration_ms2: number
  deceleration_ms2: number
  dwell_s: number
}

// A time window with a fixed headway between departures.
export interface FrequencyWindow {
  start_time: string
  end_time: string
  headway_s: number
}

// How a service's derived data was produced.
export type Provenance = 'computed' | 'calibrated' | 'frozen'

// A service embeds its ordered stops, vehicle params, and frequency windows.
export interface Service {
  id: string
  slug: string
  name: string
  stops: Stop[]
  vehicle: VehicleParams
  frequency_windows: FrequencyWindow[]
  provenance: Provenance
  owner_id?: string | null
  created_at?: string
  updated_at?: string
}

// Create/update payload for a service (no server-assigned fields).
export interface ServiceInput {
  name: string
  stops: Stop[]
  vehicle: VehicleParams
  frequency_windows: FrequencyWindow[]
}

// A scenario is a curated list of service IDs.
export interface Scenario {
  id: string
  slug: string
  name: string
  description: string
  service_ids: string[]
  owner_id?: string | null
  created_at?: string
  updated_at?: string
}

// Create/update payload for a scenario.
export interface ScenarioInput {
  name: string
  description: string
  service_ids: string[]
}

// GeoJSON LineString geometry for a route.
export interface GeoLineString {
  type: 'LineString'
  coordinates: number[][]
}

// Per-segment physics between two consecutive stops.
export interface RouteSegment {
  from_seq: number
  to_seq: number
  distance_m: number
  run_seconds: number
  max_speed_kmh: number
}

// A computed route carrying geometry plus per-segment physics.
export interface Route {
  id: string
  slug: string
  scenario_slug: string
  geometry: GeoLineString
  segments: RouteSegment[]
}

// Lifecycle state of an async job.
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

// An async job: submit, poll, then fetch its result by slug.
export interface Job {
  id: string
  status: JobStatus
  result_slug?: string | null
  error?: string | null
  progress?: number
  created_at?: string
  updated_at?: string
}
