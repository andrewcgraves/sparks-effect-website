import type { Map } from 'maplibre-gl'
import type { Route, Station } from '../api/scenarios'
import { readThemeToken } from '../themeTokens'

export const ROUTE_SOURCE_ID = 'route-source'
export const ROUTE_LINE_LAYER_ID = 'route-line'
export const STATION_SOURCE_ID = 'station-source'
export const STATION_DOTS_LAYER_ID = 'station-dots'

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
