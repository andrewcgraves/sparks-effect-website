import type { JobStatus } from '../polling'

// Slug, chainage_m, and offset_m are server-assigned: they appear on a stop
// read back from the API, but are meaningless (and ignored) on a stop a client
// is submitting, since the server re-derives them by snapping to the route on
// every write.
export interface Stop {
  name: string
  lat: number
  lng: number
  seq: number
  slug?: string
  chainage_m?: number
  offset_m?: number
}

// The server sends these as stable strings, so a build that meets a kind it
// does not list here has met a rule it was never taught to attribute — see
// stopPlacementFault.
//
// The array is the single copy: the union type is derived from it, and the
// runtime check that a value is one of them reads the same array, so a third
// kind cannot be added to one and forgotten in the other.
export const STOP_PLACEMENT_FAULT_KINDS = ['off_route', 'chainage_order'] as const

export type StopPlacementFaultKind = typeof STOP_PLACEMENT_FAULT_KINDS[number]

// seq is the key: it is the stop's position in the request, so it maps back to
// a row the author can actually go and move. name and slug are for display —
// neither survives a rejected write as an identifier, since the server mints
// slugs from names and stores nothing when it refuses.
export interface FaultedStop {
  seq: number
  name: string
  slug: string
  chainage_m: number
  offset_m: number
}

// The `detail` of a 422 refusing a service's stop placement — the machine-
// readable half of the rejection, alongside the prose a user reads.
export interface StopPlacementFault {
  fault: StopPlacementFaultKind
  // Carried through as the server sent them. Only `fault` and `stops` decide
  // whether a fault can be attributed to rows, so these two are along for the
  // ride rather than load-bearing, and their absence is not a reason to throw
  // an otherwise usable fault away.
  route_slug?: string
  // The distance the fault was measured against, echoed on an off-route fault.
  // An order fault is not measured against a distance, so it carries none.
  threshold_m?: number
  // The offending stops in authored order: one for off_route, the adjacent
  // pair for chainage_order.
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
  description?: string
  stops: Stop[]
  vehicle: VehicleParams
  frequency_windows: FrequencyWindow[]
  owner_id?: string | null
  created_at?: string
  updated_at?: string
}

// The route is named by slug — the server resolves it to its internal id, so a
// client never has to know (or spoof) one.
export interface ServiceInput {
  route_slug: string
  name: string
  stops: Stop[]
  vehicle: VehicleParams
  frequency_windows: FrequencyWindow[]
}

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

export interface ScenarioInput {
  name: string
  description: string
  service_ids: string[]
}

// How a person covers the access and egress legs of an isochrone. The array is
// the single copy: the union is derived from it, so a mode cannot be added to
// the selector and forgotten in the request body (or the reverse). Matches the
// API's TravelMode enum (SPA-248), including transit — walk plus scheduled
// local transit to and from a station, not a rival to the compiled ride leg
// (SPA-246). Valhalla spells the same costing "multimodal"; that translation
// stays in the worker.
export const TRAVEL_MODES = ['walk', 'bike', 'drive', 'transit'] as const

export type TravelMode = (typeof TRAVEL_MODES)[number]

// POST /api/user-scenarios/{slug}/isochrone and POST /api/services/{slug}/isochrone
// take this identical body. The target is named in the URL, not the body, unlike
// the seeded /api/isochrone, which carries scenario_slug alongside these same
// fields.
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
  mode: string
  geometry: GeoLineString
  bidirectional: boolean
  segments: RouteSegment[]
}

export interface RouteSummary {
  slug: string
  name: string
  mode: string
}

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

// Defined with the poller that reads it, and re-exported here because a
// routing job speaks the same four states — one vocabulary, not a compile copy
// and a routing copy that must agree forever.
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

// `names` carries every distinct member name, so a caller can render an
// unexpected merge rather than silently showing one name.
export interface StopCluster {
  key: string
  names: string[]
  members: StopRef[]
}

// A missed merge is otherwise silent: the compile succeeds and the graph is
// simply smaller.
export interface NearMiss {
  a: StopRef
  b: StopRef
  distance_m: number
}

// clusters and near_misses are omitted from the job result entirely when empty.
export interface MergeReport {
  clusters?: StopCluster[]
  near_misses?: NearMiss[]
}

export interface TransitGraph {
  services: ServiceGraph[]
  merge?: MergeReport
  nodes?: GraphNode[]
  // The member services' routes, bundled by the user-scenario graph read so a
  // client can draw each service along its alignment. Absent on the persisted
  // compile result; present on GET /api/user-scenarios/{slug}/graph.
  routes?: Route[]
}

// There is no separate fetch-by-slug for a compile result — trigger, poll by
// id, then read the result off the job itself once it succeeds.
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
