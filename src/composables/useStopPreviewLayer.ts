import type { Map, GeoJSONSource } from 'maplibre-gl'
import { readThemeToken } from '../themeTokens'

export const RAW_STOP_SOURCE_ID = 'stop-preview-raw-source'
export const RAW_STOP_LAYER_ID = 'stop-preview-raw'
export const SNAPPED_STOP_SOURCE_ID = 'stop-preview-snapped-source'
export const SNAPPED_STOP_LAYER_ID = 'stop-preview-snapped'
export const LEADER_SOURCE_ID = 'stop-preview-leader-source'
export const LEADER_LAYER_ID = 'stop-preview-leader'

export interface LatLng {
  lat: number
  lng: number
}

// One stop's raw-input/snapped-position pairing for the authoring map preview.
// snapped is null until the snap-preview call for it has resolved.
export interface StopPreviewPair {
  id: string
  raw: LatLng
  snapped?: LatLng | null
  offRoute?: boolean
}

function point(coord: LatLng) {
  return { type: 'Point' as const, coordinates: [coord.lng, coord.lat] }
}

function emptyFeatureCollection() {
  return { type: 'FeatureCollection' as const, features: [] }
}

// Draws the raw pin, the snapped pin, and a leader line between them for each
// stop being authored — the before/after pairing the amendment calls for,
// meaningful only while a service is being drafted (the snap is never
// persisted). Call update() whenever the stop list or a snap-preview result
// changes; sources are created once, up front.
export function useStopPreviewLayer(map: Map): { update: (pairs: StopPreviewPair[]) => void } {
  const rawColor = readThemeToken('--color-ink-muted')
  const snappedColor = readThemeToken('--color-ink')
  const offRouteColor = readThemeToken('--color-coral')

  map.addSource(RAW_STOP_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() })
  map.addLayer({
    id: RAW_STOP_LAYER_ID,
    type: 'circle',
    source: RAW_STOP_SOURCE_ID,
    paint: {
      'circle-radius': 5,
      'circle-color': rawColor,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  })

  map.addSource(LEADER_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() })
  map.addLayer({
    id: LEADER_LAYER_ID,
    type: 'line',
    source: LEADER_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['case', ['get', 'offRoute'], offRouteColor, rawColor],
      'line-width': 1.5,
      'line-dasharray': [2, 2],
    },
  })

  map.addSource(SNAPPED_STOP_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() })
  map.addLayer({
    id: SNAPPED_STOP_LAYER_ID,
    type: 'circle',
    source: SNAPPED_STOP_SOURCE_ID,
    paint: {
      'circle-radius': 6,
      'circle-color': ['case', ['get', 'offRoute'], offRouteColor, snappedColor],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  })

  function update(pairs: StopPreviewPair[]): void {
    const rawSource = map.getSource(RAW_STOP_SOURCE_ID) as GeoJSONSource
    rawSource.setData({
      type: 'FeatureCollection',
      features: pairs.map((p) => ({
        type: 'Feature' as const,
        properties: { id: p.id },
        geometry: point(p.raw),
      })),
    })

    const snapped = pairs.filter((p): p is StopPreviewPair & { snapped: LatLng } => !!p.snapped)

    const snappedSource = map.getSource(SNAPPED_STOP_SOURCE_ID) as GeoJSONSource
    snappedSource.setData({
      type: 'FeatureCollection',
      features: snapped.map((p) => ({
        type: 'Feature' as const,
        properties: { id: p.id, offRoute: !!p.offRoute },
        geometry: point(p.snapped),
      })),
    })

    const leaderSource = map.getSource(LEADER_SOURCE_ID) as GeoJSONSource
    leaderSource.setData({
      type: 'FeatureCollection',
      features: snapped.map((p) => ({
        type: 'Feature' as const,
        properties: { id: p.id, offRoute: !!p.offRoute },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [p.raw.lng, p.raw.lat],
            [p.snapped.lng, p.snapped.lat],
          ],
        },
      })),
    })
  }

  return { update }
}
