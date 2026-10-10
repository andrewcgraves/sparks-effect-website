import type { JobStatus } from '../polling'

export interface Stop {
  name: string
  lat: number
  lng: number
  seq: number
  slug?: string
  chainage_m?: number
  offset_m?: number
}

export const STOP_PLACEMENT_FAULT_KINDS = ['off_route', 'chainage_order'] as const

export type StopPlacementFaultKind = typeof STOP_PLACEMENT_FAULT_KINDS[number]

export interface FaultedStop {
  seq: number
  name: string
  slug: string
  chainage_m: number
  offset_m: number
}

export interface StopPlacementFault {
  fault: StopPlacementFaultKind
  route_slug?: string
  threshold_m?: number
  stops: FaultedStop[]
}

export interface VehicleParams {
  max_speed_kmh: number
  acceleration_ms2: number
  deceleration_ms2: number
  dwell_s: number
}

export interface FrequencyWindow {
  start_time: string
  end_time: string
  headway_s: number
}

export interface Service {
  id: string
  slug: string
  route_id: string
  name: string
  subtext?: string
  description?: string
  stops: Stop[]
  vehicle: VehicleParams
  frequency_windows: FrequencyWindow[]
  owner_id?: string | null
  created_at?: string
  updated_at?: string
}

// Mirrors UserService.Validate() in sparks-effect-api, which counts runes. A
// form's maxlength counts UTF-16 units instead, so it can only be the stricter.
export const MAX_SUBTEXT_CHARS = 140
export const MAX_DESCRIPTION_CHARS = 4000

export interface ServiceInput {
  route_slug: string
  name: string
  subtext?: string
  description?: string
  stops: Stop[]
  vehicle: VehicleParams
  frequency_windows: FrequencyWindow[]
}

export const BOARDING_WAIT_POLICIES = ['none', 'half_headway', 'full_headway', 'fixed'] as const

export type BoardingWaitPolicy = (typeof BOARDING_WAIT_POLICIES)[number]

export interface BoardingWaitOverride {
  policy: BoardingWaitPolicy
  secs?: number
}

export interface StopIdentity {
  service_id: string
  slug: string
}

export interface InterchangePair {
  a: StopIdentity
  b: StopIdentity
}

export interface Scenario {
  id: string
  slug: string
  name: string
  description: string
  service_ids: string[]
  interchange_pairs?: InterchangePair[]
  boarding_wait?: BoardingWaitOverride | null
  owner_id?: string | null
  created_at?: string
  updated_at?: string
}

// Both are written whole on every PUT: the API replaces interchange_pairs with
// whatever the body carries (absent included), so an input that left them out
// would erase pairs set elsewhere. boarding_wait null is "use the default".
export interface ScenarioInput {
  name: string
  description: string
  service_ids: string[]
  interchange_pairs: InterchangePair[]
  boarding_wait: BoardingWaitOverride | null
}

export const TRAVEL_MODES = ['walk', 'bike', 'drive', 'transit'] as const

export type TravelMode = (typeof TRAVEL_MODES)[number]

export interface AuthoredIsochroneRequest {
  lat: number
  lng: number
  budget_mins: number
  mode: TravelMode
}

export interface GeoLineString {
  type: 'LineString'
  coordinates: number[][]
}

export interface RouteSegment {
  cant_mm: number
  curve_radius_m: number
  grade_pct: number
}

export interface Route {
  id: string
  scenario_id?: string | null
  slug: string
  name: string
  description?: string
  mode: string
  geometry: GeoLineString
  bidirectional: boolean
  segments: RouteSegment[]
}

export interface RouteSummary {
  slug: string
  name: string
  description?: string
  mode: string
}

export const ROUTE_MODES = ['rail', 'metro', 'tram', 'bus', 'ferry', 'funicular'] as const

export type RouteMode = (typeof ROUTE_MODES)[number]

export interface RouteInput {
  type: 'LineString'
  coordinates: number[][]
  properties: {
    name: string
    description?: string
    mode: string
    bidirectional?: boolean
    scenario_slug?: string
    segments?: RouteSegment[]
  }
}

export interface RouteDependents {
  services: number
  user_services: number
  segments: number
}

// `dependents` is optional until SPA-481 lands in the API: a route read from
// an older build has none, and the pages say "unknown" rather than crash.
export type OwnedRouteSummary = RouteSummary & { id: string; length_m: number; dependents?: RouteDependents }

export type OwnedRoute = Route & { length_m: number; dependents?: RouteDependents }

export interface SnapStopInput {
  id?: string
  lat: number
  lng: number
}

export interface SnapCoord {
  lat: number
  lng: number
}

export interface SnappedStopResult {
  id?: string
  input: SnapCoord
  snapped: SnapCoord
  chainage_m: number
  offset_m: number
  off_route: boolean
}

export interface SnapStopsResponse {
  route_slug: string
  off_route_threshold_m: number
  stops: SnappedStopResult[]
  chainage_order: number[]
  order_is_consistent: boolean
}

export type { JobStatus }

export type JobKind = 'compile_scenario' | 'compile_user_scenario' | 'compile_user_service'

export interface GraphEdge {
  from_slug: string
  to_slug: string
  seconds: number
}

export interface ServiceGraph {
  service_id: string
  edges: GraphEdge[]
  wait_secs: number
}

export interface GraphNode {
  slug: string
  lat: number
  lng: number
  names: string[]
}

export interface StopRef {
  service_id: string
  slug: string
  name: string
}

export interface StopCluster {
  key: string
  names: string[]
  members: StopRef[]
}

export interface NearMiss {
  a: StopRef
  b: StopRef
  distance_m: number
}

export interface MergeReport {
  clusters?: StopCluster[]
  near_misses?: NearMiss[]
}

export interface TransitGraph {
  services: ServiceGraph[]
  merge?: MergeReport
  nodes?: GraphNode[]
  routes?: Route[]
}

export interface Job {
  id: string
  kind: JobKind
  status: JobStatus
  scenario_id?: string | null
  user_scenario_id?: string | null
  user_service_id?: string | null
  owner_id?: string | null
  error?: string | null
  result?: TransitGraph | null
  created_at?: string
  updated_at?: string
}
