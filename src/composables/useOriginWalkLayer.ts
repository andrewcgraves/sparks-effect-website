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

/**
 * Where the walking line reads its three inputs from.
 *
 * Separate getters rather than one bundle, because the module deliberately
 * watches only two of them — see `originWalkModule`.
 */
export interface OriginWalkInputs {
  origin: () => { lat: number; lng: number } | null | undefined
  data: () => ChainResponse | null
  stations: () => Station[]
}

// Shorter walk wins. Access times are whole minutes and ties are common — the
// worker rounds, and several stations can sit in the same minute — so the slug
// breaks them, leaving the same plot drawing the same line every time rather
// than following whatever order the worker happened to list them in.
function isShorterWalk(candidate: ReachableStation, best: ReachableStation): boolean {
  if (candidate.access_mins !== best.access_mins) return candidate.access_mins < best.access_mins
  return candidate.station_slug < best.station_slug
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
export function pickStarterStation(reachable: ReachableStation[]): ReachableStation | null {
  let starter: ReachableStation | null = null
  for (const candidate of reachable) {
    if (candidate.via_service) continue
    if (!starter || isShorterWalk(candidate, starter)) starter = candidate
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

// A fresh one per call: MapLibre keeps whatever it is handed, and one shared
// object passed to every map's setData would be held in several places at once.
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

/**
 * The origin-to-starter-station walk as a map module.
 *
 * The origin is read but not watched. It moves under a live form — every
 * keystroke in the coordinate fields reports a new one — while the plot on the
 * map stays as it was computed, so a line that followed the marker would leave
 * the origin behind and still point at a station chosen for where the origin
 * used to be. Watching the plot alone pins the line to it: it is redrawn when a
 * new plot arrives, at the origin that plot was requested from, and holds still
 * otherwise.
 *
 * Not ready until there is a line: a plot that boarded transit at every station
 * it reached has no walking leg to show, and adding an empty source to every map
 * in the app to hold nothing would be waste. Once attached it stays, and a later
 * plot without a starter station blanks the source rather than leaving the
 * previous plot's line standing.
 */
export function originWalkModule(inputs: OriginWalkInputs, color: string): MapModule {
  const line = () => originWalkLine(inputs.origin(), inputs.data(), inputs.stations())

  return {
    deps: () => [inputs.data(), inputs.stations()],
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
