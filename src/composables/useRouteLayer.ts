import type { Map } from 'maplibre-gl'
import type { Route, Station } from '../api/scenarios'
import { readThemeToken } from '../themeTokens'

export const ROUTE_SOURCE_ID = 'route-source'
export const ROUTE_LINE_LAYER_ID = 'route-line'
export const STATION_SOURCE_ID = 'station-source'
export const STATION_DOTS_LAYER_ID = 'station-dots'

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

export function useRouteLayer(map: Map, routes: Route[], stations: Station[]): void {
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
      'circle-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-stroke-color': ink,
    },
  })
}
