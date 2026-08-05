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

/**
 * Where the walking line reads its one input from.
 *
 * A getter rather than a value, so the module can be handed props once and
 * still see them change — see `originWalkModule`.
 */
export interface OriginWalkInputs {
  data: () => ChainResponse | null
}

/**
 * The routed walking leg from the origin to the starter station, or null when
 * there is no such leg to draw.
 *
 * This builds no geometry. The worker routes that leg against the street
 * network and reports the shape it walked (SPA-196), so what is drawn is the
 * thing that was measured: it follows streets rather than cutting across them,
 * it starts where Valhalla snapped the origin rather than at the raw point the
 * user gave, and it ends at the graph node the access time was measured to
 * rather than wherever the station's row sits now. All three used to diverge
 * when this function drew a segment between two points of its own choosing.
 *
 * The access time is the one thing still joined on: the walk names its station,
 * and the plot's own accounting is what says how long the walk took.
 */
export function originWalkLine(data: ChainResponse | null): OriginWalkLine | null {
  if (!data) return null

  const walk = data.metadata.starter_walk
  if (!walk) return null

  const station = data.metadata.reachable_stations.find(
    (s) => s.station_slug === walk.station_slug,
  )
  // A walk naming a station the plot's own accounting does not list is a
  // response contradicting itself, and there is no walk time to label it with.
  if (!station) return null

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          station_slug: walk.station_slug,
          access_mins: station.access_mins,
        },
        geometry: walk.geometry,
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
 * The plot is the only thing watched, and now the only thing read. The origin
 * moves under a live form — every keystroke in the coordinate fields reports a
 * new one — and the station rows move whenever a scenario is edited, but
 * neither changes a walk that has already been routed and timed. Redrawing on
 * the plot alone pins the line to the thing it describes.
 *
 * Not ready until there is a line: a plot that reached no station on foot has
 * no walking leg to show, and adding an empty source to every map in the app to
 * hold nothing would be waste. Once attached it stays, and a later plot without
 * a walking leg blanks the source rather than leaving the previous plot's line
 * standing.
 */
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
