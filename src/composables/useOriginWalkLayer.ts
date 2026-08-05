import type { GeoJSONSource, Map } from 'maplibre-gl'
import type { FeatureCollection, LineString } from 'geojson'
import type { MapModule } from './mapLifecycle'
import type { ChainResponse, ReachableStation } from '../fixtures/isochrone'
import type { Station } from '../api/scenarios'
import { readThemeToken } from '../themeTokens'

export const ORIGIN_WALK_SOURCE_ID = 'origin-walk-source'
export const ORIGIN_WALK_LAYER_ID = 'origin-walk-line'

export interface OriginWalkProperties {
  station_slug: string
  access_mins: number
}

export type OriginWalkLine = FeatureCollection<LineString, OriginWalkProperties>

export interface OriginWalkInputs {
  origin: { lat: number; lng: number } | null | undefined
  data: ChainResponse | null
  stations: Station[]
}

/**
 * The station the rider walks to before boarding anything.
 *
 * It is the one reached without a service recorded against it — every other
 * entry in the list was arrived at by riding — and, where more than one was
 * reached on foot, the shortest of those walks. The worker leaves such a
 * station in the reachable list without an isochrone of its own (SPA-188)
 * precisely so this line can be drawn to it.
 */
export function pickStarterStation(stations: ReachableStation[]): ReachableStation | null {
  let starter: ReachableStation | null = null
  for (const station of stations) {
    if (station.via_service) continue
    if (!starter || station.access_mins < starter.access_mins) starter = station
  }
  return starter
}

/**
 * The walking leg from the origin marker to the starter station, or null when
 * there is no such leg to draw.
 *
 * It is a straight segment between the two points, not a routed footpath: the
 * chain's own accounting has no geometry for the access leg, only its duration,
 * and the line is there to say which station the walk was to — the isochrone
 * around the origin already shows how far that walk reaches.
 */
export function originWalkLine(
  origin: { lat: number; lng: number } | null | undefined,
  data: ChainResponse | null,
  stations: Station[],
): OriginWalkLine | null {
  if (!origin || !data) return null

  const starter = pickStarterStation(data.metadata.reachable_stations)
  if (!starter) return null

  // The reachable list names slugs; the scenario's station list is the only
  // thing that says where they are.
  const station = stations.find((s) => s.slug === starter.station_slug)
  if (!station) return null

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          station_slug: starter.station_slug,
          access_mins: starter.access_mins,
        },
        geometry: {
          type: 'LineString',
          coordinates: [[origin.lng, origin.lat], station.location.coordinates],
        },
      },
    ],
  }
}

const EMPTY_LINE: OriginWalkLine = { type: 'FeatureCollection', features: [] }

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

/**
 * The origin-to-starter-station walk as a map module.
 *
 * Not ready until there is a line: a plot that boarded transit at every station
 * it reached has no walking leg to show, and adding an empty source to every
 * map in the app to hold nothing would be waste. Once attached it stays, and a
 * later plot without a starter station blanks the source rather than leaving
 * the previous plot's line standing over an origin it no longer belongs to.
 */
export function originWalkModule(inputs: () => OriginWalkInputs, color: string): MapModule {
  const line = () => {
    const { origin, data, stations } = inputs()
    return originWalkLine(origin, data, stations)
  }

  return {
    deps: () => {
      const { origin, data, stations } = inputs()
      return [origin, data, stations]
    },
    isReady: (styleLoaded) => styleLoaded && line() !== null,
    attach: (map) => {
      const current = line()
      if (current) useOriginWalkLayer(map, current, color)
    },
    sync: (map) => {
      const source = map.getSource(ORIGIN_WALK_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(line() ?? EMPTY_LINE)
    },
    detach: () => {},
  }
}
