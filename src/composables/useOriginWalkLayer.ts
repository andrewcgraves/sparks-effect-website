import type { GeoJSONSource, Map } from 'maplibre-gl'
import type { FeatureCollection, LineString } from 'geojson'
import type { MapModule } from './mapLifecycle'
import type { ChainResponse } from '../fixtures/isochrone'
import { readThemeToken } from '../themeTokens'

export const ORIGIN_WALK_SOURCE_ID = 'origin-walk-source'
export const ORIGIN_WALK_LAYER_ID = 'origin-walk-line'

export interface OriginWalkProperties {
  station_slug: string
  access_mins: number
}

export type OriginWalkLine = FeatureCollection<LineString, OriginWalkProperties>

export interface OriginWalkInputs {
  data: () => ChainResponse | null
}

export function originWalkLine(data: ChainResponse | null): OriginWalkLine | null {
  if (!data) return null

  const walk = data.metadata.starter_walk
  if (!walk) return null

  const reached = data.metadata.reachable_stations.find(
    (s) => s.station_slug === walk.station_slug,
  )
  // A walk naming a station the plot's own accounting does not list is a
  // response contradicting itself, and there is no walk time to label it with.
  if (!reached) return null

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          station_slug: walk.station_slug,
          access_mins: reached.access_mins,
        },
        geometry: walk.geometry,
      },
    ],
  }
}

function emptyLine(): OriginWalkLine {
  return { type: 'FeatureCollection', features: [] }
}

export function useOriginWalkLayer(
  map: Map,
  line: OriginWalkLine,
  color: string = readThemeToken('--color-data-origin'),
): void {
  map.addSource(ORIGIN_WALK_SOURCE_ID, {
    type: 'geojson',
    data: line,
  })

  map.addLayer({
    id: ORIGIN_WALK_LAYER_ID,
    type: 'line',
    source: ORIGIN_WALK_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': color,
      'line-width': 2,
      'line-dasharray': [1, 2],
    },
  })
}

export function originWalkModule(inputs: OriginWalkInputs, color: string): MapModule {
  const line = () => originWalkLine(inputs.data())

  return {
    deps: () => [inputs.data()],
    isReady: (styleLoaded) => styleLoaded && line() !== null,
    // Falls back to an empty source rather than skipping: the driver marks this
    // module attached either way, and a module that attached without its source
    // could never be synced again.
    attach: (map) => useOriginWalkLayer(map, line() ?? emptyLine(), color),
    sync: (map) => {
      const source = map.getSource(ORIGIN_WALK_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(line() ?? emptyLine())
    },
    detach: () => {},
  }
}
