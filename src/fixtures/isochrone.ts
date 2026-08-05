import type { FeatureCollection, LineString, Polygon } from 'geojson'
import sampleIsochroneResponse from './sample-isochrone-response.json'

export interface ReachableStation {
  station_slug: string
  access_mins: number
  remaining_mins: number
  // The service ridden to get here, absent when the station was reached on foot
  // from the origin.
  via_service?: string
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
  scenario_slug: string
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
