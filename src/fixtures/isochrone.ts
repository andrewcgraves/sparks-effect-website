import type { FeatureCollection, LineString, Polygon } from 'geojson'
import sampleIsochroneResponse from './sample-isochrone-response.json'

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
  via_service?: string
  access_secs?: number
  remaining_secs?: number
  predecessor_slug?: string
  board_slug?: string
  board_wait_secs?: number
  legs?: JourneyLeg[]
}

export interface StarterWalk {
  station_slug: string
  geometry: LineString
}

export interface TripProgress {
  from: string
  to: string
  service_id?: string
  route_id: string
  from_chainage_m: number
  to_chainage_m: number
  fraction: number
  remaining_secs: number
  ride_secs: number
}

export interface ChainMetadata {
  reachable_stations: ReachableStation[]
  origin_budget_mins: number
  compile_job_id: string
  mode: string
  wait_model: string
  origin_iso_available: boolean
  origin_iso_clamped?: boolean
  starter_walk?: StarterWalk
  trip_progress?: TripProgress[]
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
