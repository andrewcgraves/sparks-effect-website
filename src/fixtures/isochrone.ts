import type { FeatureCollection, LineString, MultiPolygon, Polygon } from 'geojson'

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
  access_rode_transit?: boolean
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

export interface ChainResponse extends FeatureCollection<Polygon | MultiPolygon, IsochroneFeatureProperties> {
  metadata: ChainMetadata
}

// Walks the nesting rather than assuming its depth: a contour comes back as a
// Polygon when it is one piece and a MultiPolygon when denoising splits it into
// several, and reading a MultiPolygon a ring at a time yields NaN corners —
// which fitBounds rejects by throwing, leaving the camera exactly where it was
// (SPA-320).
function eachPosition(
  coordinates: unknown,
  visit: (lng: number, lat: number) => void,
): void {
  if (!Array.isArray(coordinates)) return
  if (typeof coordinates[0] === 'number') {
    const [lng, lat] = coordinates as number[]
    if (Number.isFinite(lng) && Number.isFinite(lat)) visit(lng, lat)
    return
  }
  for (const nested of coordinates) eachPosition(nested, visit)
}

export function boundsFromFeatures(
  features: ChainResponse['features'],
  padding = 0.04,
): [number, number, number, number] {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const feature of features) {
    eachPosition(feature.geometry?.coordinates, (lng, lat) => {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    })
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

// The padded bounds of src/fixtures/sample-isochrone-response.json, written out
// so the map chunk need not carry the response to compute them (SPA-493).
// isochrone.spec.ts recomputes them from it.
export const ISOCHRONE_BOUNDS_CORNERS: [[number, number], [number, number]] = [
  [-122.447608, 36.93524],
  [-121.48912, 37.837807],
]

export const ISOCHRONE_CENTER: [number, number] = [
  (ISOCHRONE_BOUNDS_CORNERS[0][0] + ISOCHRONE_BOUNDS_CORNERS[1][0]) / 2,
  (ISOCHRONE_BOUNDS_CORNERS[0][1] + ISOCHRONE_BOUNDS_CORNERS[1][1]) / 2,
]
