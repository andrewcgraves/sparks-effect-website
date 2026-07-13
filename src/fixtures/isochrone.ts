import type { Feature, FeatureCollection, Polygon } from 'geojson'

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
  origin_iso_clamped: boolean
  origin_iso_available: boolean
}

export interface IsochroneFeatureProperties {
  source: 'origin' | 'egress'
  station_slug: string
  remaining_mins: number
}

export interface ChainResponse extends FeatureCollection<Polygon, IsochroneFeatureProperties> {
  metadata: ChainMetadata
}

// Bounds: [minLng, minLat, maxLng, maxLat] — covers all three polygons with padding
export const ISOCHRONE_BOUNDS: [number, number, number, number] = [-122.42, 37.577, -122.358, 37.815]

const originFeature: Feature<Polygon, IsochroneFeatureProperties> = {
  type: 'Feature',
  properties: { source: 'origin', station_slug: 'sf-transbay', remaining_mins: 30 },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-122.410, 37.799],
        [-122.384, 37.799],
        [-122.384, 37.779],
        [-122.410, 37.779],
        [-122.410, 37.799],
      ],
    ],
  },
}

const sfEgressFeature: Feature<Polygon, IsochroneFeatureProperties> = {
  type: 'Feature',
  properties: { source: 'egress', station_slug: 'sf', remaining_mins: 25 },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-122.408, 37.805],
        [-122.370, 37.805],
        [-122.370, 37.773],
        [-122.408, 37.773],
        [-122.408, 37.805],
      ],
    ],
  },
}

const millbraeEgressFeature: Feature<Polygon, IsochroneFeatureProperties> = {
  type: 'Feature',
  properties: { source: 'egress', station_slug: 'millbrae', remaining_mins: 20 },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-122.405, 37.611],
        [-122.369, 37.611],
        [-122.369, 37.587],
        [-122.405, 37.587],
        [-122.405, 37.611],
      ],
    ],
  },
}

export const staticIsochroneResponse: ChainResponse = {
  type: 'FeatureCollection',
  features: [originFeature, sfEgressFeature, millbraeEgressFeature],
  metadata: {
    reachable_stations: [
      { station_slug: 'sf', access_mins: 5, remaining_mins: 25 },
      { station_slug: 'millbrae', access_mins: 10, remaining_mins: 20 },
    ],
    origin_budget_mins: 30,
    scenario_slug: 'ca-hsr',
    mode: 'walk',
    wait_model: 'none',
    origin_iso_clamped: false,
    origin_iso_available: true,
  },
}
