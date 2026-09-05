import type { DataDrivenPropertyValueSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import type { FeatureCollection, LineString, Point } from 'geojson'
import type { MapModule } from './mapLifecycle'
import type { ChainResponse, TripProgress } from '../fixtures/isochrone'
import type { Route, Station } from '../api/scenarios'
import { readThemeToken } from '../themeTokens'
import { sliceAlignment } from '../chainage'

export const ROUTE_SOURCE_ID = 'route-source'
export const ROUTE_LINE_LAYER_ID = 'route-line'
export const STATION_SOURCE_ID = 'station-source'
export const STATION_DOTS_LAYER_ID = 'station-dots'
export const PROGRESS_SOURCE_ID = 'trip-progress-source'
export const PROGRESS_LINE_LAYER_ID = 'trip-progress-line'
export const PROGRESS_CAP_SOURCE_ID = 'trip-progress-cap-source'
export const PROGRESS_CAP_LAYER_ID = 'trip-progress-cap'

export const STATION_DOT_DEFAULT_COLOR = '#ffffff'

/** Which unfinished leg a stub describes, so a drawn line can be identified. */
export interface TripProgressProperties {
  from: string
  to: string
  service_id?: string
  fraction: number
}

export type TripProgressLines = FeatureCollection<LineString, TripProgressProperties>
export type TripProgressCaps = FeatureCollection<Point, TripProgressProperties>

/**
 * The stubs to draw: for each leg the rider did not finish, the stretch of its
 * corridor their budget carried them along.
 *
 * The alignment is sliced rather than a chord drawn between the two stations,
 * so the stub reads as travel along a railway and not as a line across the
 * landscape. Where the slicing happens is `../chainage`, which measures in the
 * same planar frame the API's chainages were measured in.
 *
 * A leg naming a route this map does not hold is skipped rather than thrown on:
 * progress is decoration, and a station's missing stub is a far smaller fault
 * than a map that fails to render. So is a zero fraction, and a span of no
 * length — but nothing else. There is deliberately no minimum: any fraction
 * floor would recreate at a smaller scale the very fault this feature fixes,
 * and a floor expressed as a fraction means wildly different things on a 400 km
 * hop and an 800 m one.
 */
export function tripProgressLines(
  routes: Route[],
  progress: TripProgress[] | undefined,
): TripProgressLines {
  // A record rather than a Map: maplibre's own `Map` is the one imported into
  // this module, and `new Map` here would resolve to it.
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

/**
 * A marker at each stub's far end: the point the rider's budget ran out.
 *
 * Derived from the drawn lines rather than recomputed, so "how far" is a
 * definite place on the very line beside it and the two cannot disagree.
 */
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

/**
 * The slugs of stations the current isochrone plot can reach, in the shape
 * `useRouteLayer` and its module need to paint them.
 *
 * A plot with no reach yet (none generated, or the rider's origin missed
 * every station) is the same as an empty list to a caller — both mean no
 * dot lights up.
 */
export function reachableStationSlugs(data: ChainResponse | null): string[] {
  return data?.metadata.reachable_stations.map((s) => s.station_slug) ?? []
}

/**
 * The station dots' `circle-color`, keyed off which stations the current
 * plot can reach.
 *
 * A `match` expression needs at least one label, so an empty reach falls
 * back to the plain default color rather than a degenerate expression.
 */
export function stationDotColor(
  reachableSlugs: string[],
  highlightColor: string,
): DataDrivenPropertyValueSpecification<string> {
  if (reachableSlugs.length === 0) return STATION_DOT_DEFAULT_COLOR
  return ['match', ['get', 'slug'], reachableSlugs, highlightColor, STATION_DOT_DEFAULT_COLOR]
}

/* A fixed absolute-degree pad would swamp a short local route and be
   negligible on a cross-state one, so pad proportionally to the route's own
   extent instead — this is what keeps the fit generalized across route scales. */
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

export function useRouteLayer(
  map: Map,
  routes: Route[],
  stations: Station[],
  reachableSlugs: string[] = [],
  highlightColor: string = readThemeToken('--color-data-egress'),
  progress: TripProgress[] = [],
): void {
  const ink = readThemeToken('--color-ink')

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

  map.addLayer({
    id: ROUTE_LINE_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ink, 'line-width': 2.5 },
  })

  // Above the route line and below the station dots. The stub belongs visually
  // between the two: it runs along the railway it is drawn on and stops short of
  // the dot it is heading for, and a dot obscured by it would be the one dot
  // whose unlit state is the point being made.
  const stubs = tripProgressLines(routes, progress)
  map.addSource(PROGRESS_SOURCE_ID, { type: 'geojson', data: stubs })
  map.addLayer({
    id: PROGRESS_LINE_LAYER_ID,
    type: 'line',
    source: PROGRESS_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    // Dashed rather than solid, because a fully ridden hop carries no highlight
    // at all: a solid coloured overlay would make the one leg nobody completes
    // read as more reached than the legs actually ridden. Provisional, not
    // emphasised.
    paint: {
      'line-color': highlightColor,
      'line-width': 3,
      'line-dasharray': [2, 2],
    },
  })

  map.addSource(PROGRESS_CAP_SOURCE_ID, { type: 'geojson', data: tripProgressCaps(stubs) })
  map.addLayer({
    id: PROGRESS_CAP_LAYER_ID,
    type: 'circle',
    source: PROGRESS_CAP_SOURCE_ID,
    paint: {
      'circle-radius': 3.5,
      'circle-color': highlightColor,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': ink,
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

  map.addLayer({
    id: STATION_DOTS_LAYER_ID,
    type: 'circle',
    source: STATION_SOURCE_ID,
    paint: {
      'circle-radius': 5,
      'circle-color': stationDotColor(reachableSlugs, highlightColor),
      'circle-stroke-width': 2,
      'circle-stroke-color': ink,
    },
  })
}

/**
 * The route and station layers as a map module.
 *
 * Not ready until there is at least one route: adding an empty source would
 * draw nothing and then never be revisited, and routes arrive from the scenario
 * fetch well after the map itself.
 */
export function routeLayerModule(
  inputs: () => { routes: Route[]; stations: Station[] },
  isochroneData: () => ChainResponse | null,
  highlightColor: string,
): MapModule {
  const reachable = () => reachableStationSlugs(isochroneData())
  const progress = () => isochroneData()?.metadata.trip_progress ?? []

  return {
    deps: () => {
      const { routes, stations } = inputs()
      return [routes, stations, reachable(), progress()]
    },
    isReady: (styleLoaded) => styleLoaded && inputs().routes.length > 0,
    attach: (map) => {
      const { routes, stations } = inputs()
      useRouteLayer(map, routes, stations, reachable(), highlightColor, progress())
    },
    // The route/station positions are fetched once and do not move under an
    // open map, but which dots are lit does: the rider can regenerate the
    // isochrone with a different reach. The stubs move for exactly the same
    // reason and at exactly the same moment, which is why they are re-applied
    // here rather than from a module of their own.
    sync: (map) => {
      map.setPaintProperty(STATION_DOTS_LAYER_ID, 'circle-color', stationDotColor(reachable(), highlightColor))

      const stubs = tripProgressLines(inputs().routes, progress())
      ;(map.getSource(PROGRESS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(stubs)
      ;(map.getSource(PROGRESS_CAP_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
        tripProgressCaps(stubs),
      )
    },
    detach: () => {},
  }
}
