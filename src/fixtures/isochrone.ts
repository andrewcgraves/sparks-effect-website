import type { FeatureCollection, LineString, Polygon } from 'geojson'
import sampleIsochroneResponse from './sample-isochrone-response.json'

/**
 * One hop of a journey: the ride from one station to the next on one service,
 * and the dwell served on arrival.
 *
 * `secs` is the whole hop and `dwell_s` the part of it the vehicle spends
 * standing at `to`, so the ride itself is the difference. Dwell is absent on a
 * graph compiled before the API reported it, which reads as a journey with no
 * dwell anywhere — incomplete, never wrong.
 */
export interface JourneyLeg {
  from: string
  to: string
  service_id?: string
  secs: number
  dwell_s?: number
}

export interface ReachableStation {
  station_slug: string
  access_mins: number
  remaining_mins: number
  // The service ridden to get here, absent when the station was reached on foot
  // from the origin. It names only the first service boarded, so on a journey
  // that changes service it is wrong for every hop past the change — `legs` is
  // what the graph reads instead.
  via_service?: string
  // Seconds alongside the whole minutes above. Adding hop to hop down a long
  // journey in truncated minutes loses a minute at every stop, so the graph
  // works in seconds and rounds once, at the point of display. Absent on a
  // result plotted before the worker reported them.
  access_secs?: number
  remaining_secs?: number
  // The station ridden from on the last hop, absent exactly when the rider
  // walked here from the origin. Following it from any station arrives at one
  // the rider walked to, which is what makes the set a tree.
  predecessor_slug?: string
  // Where the rider boarded and what they waited there. The wait is charged
  // once for the whole journey, so it belongs to that station and to no later
  // one — a transfer costs nothing.
  board_slug?: string
  board_wait_secs?: number
  // The journey retraced, boarding station first. Empty for a station the rider
  // walked to and rode nothing from.
  legs?: JourneyLeg[]
}

/**
 * The walk from the origin to the station the rider boards at, as the worker
 * routed it.
 *
 * The geometry is Valhalla's own, so it follows streets rather than cutting
 * across them, and its endpoints are where the timing actually started and
 * ended: the origin snapped to the nearest routable edge, and the graph node
 * the access time was measured to rather than wherever the station's row sits
 * now. Nothing here needs to be joined against the station list to be drawn.
 */
export interface StarterWalk {
  station_slug: string
  geometry: LineString
}

export interface ChainMetadata {
  reachable_stations: ReachableStation[]
  origin_budget_mins: number
  // The compiled graph the surface was plotted over, named by the job that
  // produced it. The worker has no scenario identity to report — the queue
  // message carries only this — so the scenario slug this field used to be
  // matched the checked-in sample and nothing the worker ever sent.
  compile_job_id: string
  mode: string
  wait_model: string
  origin_iso_available: boolean
  origin_iso_clamped?: boolean
  // Absent when the plot reached no station on foot, and when the worker's
  // route call for one failed — the surface is complete either way, and the
  // line is what is missing, not the plot.
  starter_walk?: StarterWalk
}

export interface IsochroneFeatureProperties {
  source: 'origin' | 'egress'
  station_slug?: string
  remaining_mins?: number
  color?: string
  contour?: number
  fill?: string
  'fill-opacity'?: number
  fillColor?: string
  fillOpacity?: number
  metric?: string
  opacity?: number
}

export interface ChainResponse extends FeatureCollection<Polygon, IsochroneFeatureProperties> {
  metadata: ChainMetadata
}

export const staticIsochroneResponse = sampleIsochroneResponse as ChainResponse

export function boundsFromFeatures(
  features: ChainResponse['features'],
  padding = 0.04,
): [number, number, number, number] {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const feature of features) {
    for (const ring of feature.geometry.coordinates) {
      for (const [lng, lat] of ring) {
        minLng = Math.min(minLng, lng)
        minLat = Math.min(minLat, lat)
        maxLng = Math.max(maxLng, lng)
        maxLat = Math.max(maxLat, lat)
      }
    }
  }

  return [minLng - padding, minLat - padding, maxLng + padding, maxLat + padding]
}

export function isochroneBoundsCorners(
  features: ChainResponse['features'],
  padding = 0.04,
): [[number, number], [number, number]] {
  const [minLng, minLat, maxLng, maxLat] = boundsFromFeatures(features, padding)
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

export const ISOCHRONE_BOUNDS = boundsFromFeatures(staticIsochroneResponse.features)

export const ISOCHRONE_CENTER: [number, number] = [
  (ISOCHRONE_BOUNDS[0] + ISOCHRONE_BOUNDS[2]) / 2,
  (ISOCHRONE_BOUNDS[1] + ISOCHRONE_BOUNDS[3]) / 2,
]

export const ISOCHRONE_BOUNDS_CORNERS: [[number, number], [number, number]] = [
  [ISOCHRONE_BOUNDS[0], ISOCHRONE_BOUNDS[1]],
  [ISOCHRONE_BOUNDS[2], ISOCHRONE_BOUNDS[3]],
]
