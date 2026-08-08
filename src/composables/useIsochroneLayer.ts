import type { DataDrivenPropertyValueSpecification, FillLayerSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import type { MapModule } from './mapLifecycle'
import type { FeatureCollection } from 'geojson'
import { readThemeToken } from '../themeTokens'
import { ROUTE_LINE_LAYER_ID } from './useRouteLayer'

export const ISOCHRONE_SOURCE_ID = 'isochrone-source'
export const ISOCHRONE_LAYER_ID = 'isochrone-fill'

export const ISOCHRONE_FILL_OPACITY = 0.35

// Used while a station is hovered or selected: its own egress isochrone reads
// clearly above the rest, and every other egress polygon fades out of the
// way instead of fighting it for the same patch of map (SPA-211). The origin
// fill is a different thing entirely — the rider's own reach, not a
// station's — so it always keeps the default opacity.
export const ISOCHRONE_HIGHLIGHT_OPACITY = 0.65
export const ISOCHRONE_DIM_OPACITY = 0.08

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

/**
 * The fill-opacity paint value for the isochrone layer, given which station
 * (if any) is currently hovered or selected.
 *
 * `null` is the plain, pre-SPA-211 opacity every feature shared. A slug
 * singles that station's egress polygon out and dims every other one, which
 * is what makes overlapping station isochrones legible instead of a single
 * blended smear.
 */
export function isochroneFillOpacity(
  highlightedStationSlug: string | null,
): DataDrivenPropertyValueSpecification<number> {
  if (!highlightedStationSlug) return ISOCHRONE_FILL_OPACITY
  return [
    'case',
    ['==', ['get', 'source'], 'origin'], ISOCHRONE_FILL_OPACITY,
    ['==', ['get', 'station_slug'], highlightedStationSlug], ISOCHRONE_HIGHLIGHT_OPACITY,
    ISOCHRONE_DIM_OPACITY,
  ]
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

  const layer: FillLayerSpecification = {
    id: ISOCHRONE_LAYER_ID,
    type: 'fill',
    source: ISOCHRONE_SOURCE_ID,
    paint: {
      'fill-color': ['match', ['get', 'source'], 'origin', colors.origin, colors.egress],
      'fill-opacity': isochroneFillOpacity(null),
    },
  }

  // The isochrone usually arrives well after the scenario's route and station
  // layers are already on the map — it is drawn only once the rider submits
  // the isochrone form, while routes/stations come from the scenario fetch on
  // load. addLayer with no beforeId always appends on top, so without this the
  // fill would paint over routes and stations that were already there
  // (SPA-213). Stacking it under the route line also puts it under the
  // station dots, which useRouteLayer always adds immediately above the line.
  if (map.getLayer(ROUTE_LINE_LAYER_ID)) {
    map.addLayer(layer, ROUTE_LINE_LAYER_ID)
  } else {
    map.addLayer(layer)
  }
}

/**
 * The isochrone fill as a map module.
 *
 * The first plot adds the source and layer; every later one rewrites the same
 * source's data, which is what keeps the fill from flashing between plots.
 * MapView used to make that add-or-update choice itself by probing getSource.
 */
export function isochroneLayerModule(
  data: () => FeatureCollection | null,
  colors: IsochroneColors,
): MapModule {
  return {
    deps: data,
    isReady: (styleLoaded) => styleLoaded && data() !== null,
    attach: (map) => {
      const geojson = data()
      if (geojson) useIsochroneLayer(map, geojson, colors)
    },
    sync: (map) => {
      const geojson = data()
      if (!geojson) return
      const source = map.getSource(ISOCHRONE_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(geojson)
    },
    detach: () => {},
  }
}
