import type { DataDrivenPropertyValueSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import type { FeatureCollection, LineString, Point } from 'geojson'
import type { MapModule } from './mapLifecycle'
import type { ChainResponse, TripProgress } from '../fixtures/isochrone'
import type { Route, Station } from '../api/scenarios'
import { readThemeToken } from '../themeTokens'
import { projectOntoAlignment, sliceAlignment } from '../chainage'
import { addLayerInStack } from './layerStack'

export const ROUTE_SOURCE_ID = 'route-source'
export const ROUTE_LINE_LAYER_ID = 'route-line'
export const STATION_SOURCE_ID = 'station-source'
export const STATION_DOTS_LAYER_ID = 'station-dots'
export const RIDDEN_SOURCE_ID = 'route-ridden-source'
export const RIDDEN_LINE_LAYER_ID = 'route-ridden-line'
export const PROGRESS_SOURCE_ID = 'trip-progress-source'
export const PROGRESS_LINE_LAYER_ID = 'trip-progress-line'
export const PROGRESS_CAP_SOURCE_ID = 'trip-progress-cap-source'
export const PROGRESS_CAP_LAYER_ID = 'trip-progress-cap'

export const STATION_DOT_DEFAULT_COLOR = '#ffffff'

export const RIDDEN_LINE_WIDTH = 2.5
export const UNRIDDEN_LINE_WIDTH = 1.25

// The furthest a stop may sit from the alignment it is a stop on: the authoring
// API rejects a placement further off-route than this. A leg whose two stations
// both project inside it is a leg of the line it is being drawn along.
const MAX_STATION_OFFSET_M = 500

export interface TripProgressProperties {
  from: string
  to: string
  service_id?: string
  fraction: number
}

export type TripProgressLines = FeatureCollection<LineString, TripProgressProperties>
export type TripProgressCaps = FeatureCollection<Point, TripProgressProperties>

export function tripProgressLines(
  routes: Route[],
  progress: TripProgress[] | undefined,
): TripProgressLines {
  // A record rather than a Map: `Map` in this module is maplibre's, so `new Map`
  // here is a typecheck failure (TS1361, "cannot be used as a value because it
  // was imported using 'import type'") rather than anything silent. The
  // alternative is aliasing the import; a record is less machinery for a lookup
  // this small.
  const byID: Record<string, Route> = {}
  for (const r of routes) byID[r.id] = r

  const features: TripProgressLines['features'] = []
  for (const leg of progress ?? []) {
    const route = byID[leg.route_id]
    if (!route || leg.fraction <= 0) continue

    const coordinates = sliceAlignment(
      route.geometry.coordinates as [number, number][],
      leg.from_chainage_m,
      leg.to_chainage_m,
      leg.fraction,
    )
    if (coordinates.length < 2) continue

    features.push({
      type: 'Feature',
      properties: {
        from: leg.from,
        to: leg.to,
        service_id: leg.service_id,
        fraction: leg.fraction,
      },
      geometry: { type: 'LineString', coordinates },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function tripProgressCaps(lines: TripProgressLines): TripProgressCaps {
  return {
    type: 'FeatureCollection',
    features: lines.features.map((f) => ({
      type: 'Feature',
      properties: f.properties,
      geometry: {
        type: 'Point',
        coordinates: f.geometry.coordinates[f.geometry.coordinates.length - 1],
      },
    })),
  }
}

export function reachableStationSlugs(data: ChainResponse | null): string[] {
  return data?.metadata.reachable_stations.map((s) => s.station_slug) ?? []
}

export function stationDotColor(
  reachableSlugs: string[],
  highlightColor: string,
): DataDrivenPropertyValueSpecification<string> {
  if (reachableSlugs.length === 0) return STATION_DOT_DEFAULT_COLOR
  return ['match', ['get', 'slug'], reachableSlugs, highlightColor, STATION_DOT_DEFAULT_COLOR]
}

export function routeBoundsCorners(
  routes: Route[],
  paddingFraction = 0.1,
): [[number, number], [number, number]] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const route of routes) {
    for (const [lng, lat] of route.geometry.coordinates) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }
  }

  if (!Number.isFinite(minLng)) return null

  const lngPadding = (maxLng - minLng) * paddingFraction
  const latPadding = (maxLat - minLat) * paddingFraction

  return [
    [minLng - lngPadding, minLat - latPadding],
    [maxLng + lngPadding, maxLat + latPadding],
  ]
}

export function centerFromCorners(
  corners: [[number, number], [number, number]],
): [number, number] {
  return [
    (corners[0][0] + corners[1][0]) / 2,
    (corners[0][1] + corners[1][1]) / 2,
  ]
}

export interface RiddenLeg {
  from: string
  to: string
  service_id?: string
}

export type RiddenLines = FeatureCollection<LineString, RiddenLeg>

export function riddenLegs(data: ChainResponse | null): RiddenLeg[] {
  const seen = new Set<string>()
  const legs: RiddenLeg[] = []
  // Every reachable station carries its whole ridden path, so the same early hop
  // appears once per station downstream of it. Each hop is reached by exactly one
  // predecessor, so keying on the ordered pair is enough to draw it once.
  for (const station of data?.metadata.reachable_stations ?? []) {
    for (const leg of station.legs ?? []) {
      const key = `${leg.from}\u0000${leg.to}`
      if (seen.has(key)) continue
      seen.add(key)
      legs.push({ from: leg.from, to: leg.to, service_id: leg.service_id })
    }
  }
  return legs
}

// A leg names two stations and a service, not a route and a chainage span the
// way trip_progress does, so the span is recovered here: the alignment both
// stations sit closest to, cut between where each projects onto it. Drawing the
// chord instead would cut every curve of the corridor the rider actually rode.
function riddenSpan(
  routes: Route[],
  fromPoint: [number, number],
  toPoint: [number, number],
): [number, number][] | null {
  let best: { offsetM: number; coordinates: [number, number][] } | null = null
  for (const route of routes) {
    const alignment = route.geometry.coordinates as [number, number][]
    const from = projectOntoAlignment(alignment, fromPoint)
    const to = projectOntoAlignment(alignment, toPoint)
    if (!from || !to) continue

    const offsetM = Math.max(from.offsetM, to.offsetM)
    if (offsetM > MAX_STATION_OFFSET_M) continue
    if (best && offsetM >= best.offsetM) continue

    const coordinates = sliceAlignment(alignment, from.chainageM, to.chainageM, 1)
    if (coordinates.length < 2) continue
    best = { offsetM, coordinates }
  }
  return best?.coordinates ?? null
}

export function riddenLines(
  routes: Route[],
  stations: Station[],
  legs: RiddenLeg[],
): RiddenLines {
  const bySlug: Record<string, Station> = {}
  for (const s of stations) bySlug[s.slug] = s

  const features: RiddenLines['features'] = []
  for (const leg of legs) {
    const from = bySlug[leg.from]
    const to = bySlug[leg.to]
    if (!from || !to) continue

    const coordinates = riddenSpan(routes, from.location.coordinates, to.location.coordinates)
    if (!coordinates) continue

    features.push({
      type: 'Feature',
      properties: { from: leg.from, to: leg.to, service_id: leg.service_id },
      geometry: { type: 'LineString', coordinates },
    })
  }
  return { type: 'FeatureCollection', features }
}

// Grey and thin only once there is a plot to be unridden relative to. With no
// plot the network is just the network — the authoring and preview maps draw no
// trip at all, and washing them out would say something about a rider who is
// not there.
export function routeLinePaint(plotted: boolean): { 'line-color': string; 'line-width': number } {
  return {
    'line-color': readThemeToken(plotted ? '--color-ink-muted' : '--color-ink'),
    'line-width': plotted ? UNRIDDEN_LINE_WIDTH : RIDDEN_LINE_WIDTH,
  }
}

export function useRouteLayer(
  map: Map,
  routes: Route[],
  stations: Station[],
  plot: ChainResponse | null = null,
  highlightColor: string = readThemeToken('--color-data-egress'),
): void {
  const ink = readThemeToken('--color-ink')
  const progress = plot?.metadata.trip_progress ?? []

  map.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: routes.map((r) => ({
        type: 'Feature' as const,
        properties: { id: r.id, name: r.name, mode: r.mode },
        geometry: r.geometry,
      })),
    },
  })

  addLayerInStack(map, {
    id: ROUTE_LINE_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: routeLinePaint(plot !== null),
  })

  // The ridden legs sit directly on top of the whole network, in ink and at the
  // width the network is drawn at when nobody is riding it: what the rider
  // covered is the emphatic state, and the rest of the map recedes behind it.
  map.addSource(RIDDEN_SOURCE_ID, {
    type: 'geojson',
    data: riddenLines(routes, stations, riddenLegs(plot)),
  })
  addLayerInStack(map, {
    id: RIDDEN_LINE_LAYER_ID,
    type: 'line',
    source: RIDDEN_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ink, 'line-width': RIDDEN_LINE_WIDTH },
  })

  // Above the route line and below the station dots. The stub belongs visually
  // between the two: it runs along the railway it is drawn on and stops short of
  // the dot it is heading for, and a dot obscured by it would be the one dot
  // whose unlit state is the point being made.
  const stubs = tripProgressLines(routes, progress)
  map.addSource(PROGRESS_SOURCE_ID, { type: 'geojson', data: stubs })
  addLayerInStack(map, {
    id: PROGRESS_LINE_LAYER_ID,
    type: 'line',
    source: PROGRESS_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    // Ink dashes at the ridden width, so the grey network shows through the gaps:
    // a leg half ridden reads as half of each state rather than as a third
    // colour. Dashed rather than solid because it is provisional — a solid ink
    // overlay would make the one leg nobody completes read as ridden.
    paint: {
      'line-color': ink,
      'line-width': RIDDEN_LINE_WIDTH,
      'line-dasharray': [2, 2],
    },
  })

  map.addSource(PROGRESS_CAP_SOURCE_ID, { type: 'geojson', data: tripProgressCaps(stubs) })
  addLayerInStack(map, {
    id: PROGRESS_CAP_LAYER_ID,
    type: 'circle',
    source: PROGRESS_CAP_SOURCE_ID,
    // An unringed ink dot: the point the budget ran out is a full stop on the
    // dashes, not a station, and the ringed dots on this map are stations.
    paint: {
      'circle-radius': 3.5,
      'circle-color': ink,
    },
  })

  map.addSource(STATION_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: stations.map((s) => ({
        type: 'Feature' as const,
        properties: { id: s.id, name: s.name, slug: s.slug },
        geometry: s.location,
      })),
    },
  })

  addLayerInStack(map, {
    id: STATION_DOTS_LAYER_ID,
    type: 'circle',
    source: STATION_SOURCE_ID,
    paint: {
      'circle-radius': 5,
      'circle-color': stationDotColor(reachableStationSlugs(plot), highlightColor),
      'circle-stroke-width': 2,
      'circle-stroke-color': ink,
    },
  })
}

export function routeLayerModule(
  inputs: () => { routes: Route[]; stations: Station[] },
  isochroneData: () => ChainResponse | null,
  highlightColor: string,
): MapModule {
  return {
    deps: () => {
      const { routes, stations } = inputs()
      return [routes, stations, isochroneData()]
    },
    isReady: (styleLoaded) => styleLoaded && inputs().routes.length > 0,
    attach: (map) => {
      const { routes, stations } = inputs()
      useRouteLayer(map, routes, stations, isochroneData(), highlightColor)
    },
    // The route/station positions are fetched once and do not move under an
    // open map, but which dots are lit does: the rider can regenerate the
    // isochrone with a different reach. The ridden legs and the stubs move for
    // exactly the same reason and at exactly the same moment, which is why they
    // are re-applied here rather than from a module of their own.
    sync: (map) => {
      const { routes, stations } = inputs()
      const plot = isochroneData()

      map.setPaintProperty(
        STATION_DOTS_LAYER_ID,
        'circle-color',
        stationDotColor(reachableStationSlugs(plot), highlightColor),
      )

      // The first plot is also what turns the whole network grey and thin, and
      // clearing back to none returns it to ink.
      const base = routeLinePaint(plot !== null)
      map.setPaintProperty(ROUTE_LINE_LAYER_ID, 'line-color', base['line-color'])
      map.setPaintProperty(ROUTE_LINE_LAYER_ID, 'line-width', base['line-width'])

      ;(map.getSource(RIDDEN_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
        riddenLines(routes, stations, riddenLegs(plot)),
      )

      const stubs = tripProgressLines(routes, plot?.metadata.trip_progress ?? [])
      ;(map.getSource(PROGRESS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(stubs)
      ;(map.getSource(PROGRESS_CAP_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
        tripProgressCaps(stubs),
      )
    },
    detach: () => {},
  }
}
