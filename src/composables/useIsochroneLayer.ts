import type { Map } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { readThemeToken } from '../themeTokens'

export const ISOCHRONE_SOURCE_ID = 'isochrone-source'
export const ISOCHRONE_LAYER_ID = 'isochrone-fill'

export const ISOCHRONE_FILL_OPACITY = 0.35

export interface IsochroneColors {
  origin: string
  egress: string
}

export function resolveIsochroneColors(): IsochroneColors {
  return {
    origin: readThemeToken('--color-data-origin'),
    egress: readThemeToken('--color-data-egress'),
  }
}

export function isochroneLegend(colors: IsochroneColors = resolveIsochroneColors()) {
  return [
    { source: 'origin', label: 'Origin reach', color: colors.origin },
    { source: 'egress', label: 'From station', color: colors.egress },
  ] as const
}

export function useIsochroneLayer(
  map: Map,
  geojson: FeatureCollection,
  colors: IsochroneColors = resolveIsochroneColors(),
): void {
  map.addSource(ISOCHRONE_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
  })

  map.addLayer({
    id: ISOCHRONE_LAYER_ID,
    type: 'fill',
    source: ISOCHRONE_SOURCE_ID,
    paint: {
      'fill-color': ['match', ['get', 'source'], 'origin', colors.origin, colors.egress],
      'fill-opacity': ISOCHRONE_FILL_OPACITY,
    },
  })
}
