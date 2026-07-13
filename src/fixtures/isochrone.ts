import type { FeatureCollection, Polygon } from 'geojson'
import sampleIsochroneResponse from './sample-isochrone-response.json'

export interface ReachableStation {
  station_slug: string
  access_mins: number
  remaining_mins: number
}

export interface ChainMetadata {
  reachable_stations: ReachableStation[]
  origin_budget_mins: number
  scenario_slug: string
  mode: string
  wait_model: string
  origin_iso_available: boolean
  origin_iso_clamped?: boolean
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

function boundsFromFeatures(
  features: ChainResponse['features'],
  padding = 0.02,
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

export const ISOCHRONE_BOUNDS = boundsFromFeatures(staticIsochroneResponse.features)
