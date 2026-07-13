import type { Map } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

export const ISOCHRONE_SOURCE_ID = 'isochrone-source'
export const ISOCHRONE_LAYER_ID = 'isochrone-fill'

export const ORIGIN_FILL_COLOR = '#4A90D9'
export const EGRESS_FILL_COLOR = '#E8734A'

export const ISOCHRONE_LEGEND = [
  { source: 'origin', label: 'Origin reach', color: ORIGIN_FILL_COLOR },
  { source: 'egress', label: 'From station', color: EGRESS_FILL_COLOR },
] as const

export function useIsochroneLayer(map: Map, geojson: FeatureCollection): void {
  map.addSource(ISOCHRONE_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
  })

  map.addLayer({
    id: ISOCHRONE_LAYER_ID,
    type: 'fill',
    source: ISOCHRONE_SOURCE_ID,
    paint: {
      'fill-color': ['match', ['get', 'source'], 'origin', ORIGIN_FILL_COLOR, EGRESS_FILL_COLOR],
      'fill-opacity': 0.35,
    },
  })
}
