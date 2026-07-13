import type { Map } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

export const ISOCHRONE_SOURCE_ID = 'isochrone-source'
export const ISOCHRONE_LAYER_ID = 'isochrone-fill'

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
      'fill-color': ['get', 'color'],
      'fill-opacity': ['get', 'opacity'],
    },
  })
}
