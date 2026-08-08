import type { DataDrivenPropertyValueSpecification, ExpressionSpecification, FillLayerSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import type { MapModule } from './mapLifecycle'
import type { FeatureCollection } from 'geojson'
import { readThemeToken } from '../themeTokens'
import { ROUTE_LINE_LAYER_ID } from './useRouteLayer'

export const ISOCHRONE_SOURCE_ID = 'isochrone-source'
export const ISOCHRONE_LAYER_ID = 'isochrone-fill'

// Draws only the hovered/selected station's egress polygon, filtered from the
// same source, stacked above ISOCHRONE_LAYER_ID. Opacity alone can't promote
// a feature above its overlapping neighbours — MapLibre paints one layer's
// features in source-array order regardless of fill-opacity — so bringing a
// polygon "to the top" needs a second layer rather than a paint tweak
// (SPA-211 follow-up).
export const ISOCHRONE_HIGHLIGHT_LAYER_ID = 'isochrone-highlight-fill'

export const ISOCHRONE_FILL_OPACITY = 0.35

// Used while a station is hovered or selected: its own egress isochrone reads
// clearly above the rest, drawn again by ISOCHRONE_HIGHLIGHT_LAYER_ID, while
// every other egress polygon in the base layer fades out of the way instead
// of fighting it for the same patch of map (SPA-211). The origin fill is a
// different thing entirely — the rider's own reach, not a station's — so it
// always keeps the default opacity.
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
 * The fill-opacity paint value for the base isochrone layer.
 *
 * `false` is the plain, pre-SPA-211 opacity every feature shared. `true`
 * dims every egress polygon uniformly, regardless of which station is
 * highlighted — that station's own polygon is repainted at full strength by
 * ISOCHRONE_HIGHLIGHT_LAYER_ID, on top of this one, so this layer no longer
 * needs to know which slug is highlighted.
 */
export function isochroneFillOpacity(dimmed: boolean): DataDrivenPropertyValueSpecification<number> {
  if (!dimmed) return ISOCHRONE_FILL_OPACITY
  return [
    'case',
    ['==', ['get', 'source'], 'origin'], ISOCHRONE_FILL_OPACITY,
    ISOCHRONE_DIM_OPACITY,
  ]
}

// Matches nothing rather than relying on station slugs never being an empty
// string: membership in a literal empty array can never be true regardless
// of what shape the data takes.
const MATCH_NO_STATION: ExpressionSpecification = ['in', ['get', 'station_slug'], ['literal', []]]

/**
 * The filter for ISOCHRONE_HIGHLIGHT_LAYER_ID: which single station's egress
 * polygon (if any) it should repaint on top of the base layer.
 */
export function isochroneHighlightFilter(highlightedStationSlug: string | null): ExpressionSpecification {
  if (!highlightedStationSlug) return MATCH_NO_STATION
  return ['==', ['get', 'station_slug'], highlightedStationSlug]
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
      'fill-opacity': isochroneFillOpacity(false),
    },
  }

  // Only egress polygons are ever highlighted, so this needs no per-source
  // match — and it starts filtered to nothing, since attaching happens
  // before any station has been hovered or clicked.
  const highlightLayer: FillLayerSpecification = {
    id: ISOCHRONE_HIGHLIGHT_LAYER_ID,
    type: 'fill',
    source: ISOCHRONE_SOURCE_ID,
    filter: isochroneHighlightFilter(null),
    paint: {
      'fill-color': colors.egress,
      'fill-opacity': ISOCHRONE_HIGHLIGHT_OPACITY,
    },
  }

  // The isochrone usually arrives well after the scenario's route and station
  // layers are already on the map — it is drawn only once the rider submits
  // the isochrone form, while routes/stations come from the scenario fetch on
  // load. addLayer with no beforeId always appends on top, so without this the
  // fill would paint over routes and stations that were already there
  // (SPA-213). Stacking it under the route line also puts it under the
  // station dots, which useRouteLayer always adds immediately above the line.
  //
  // The highlight layer is added right after, with the same beforeId, which
  // lands it directly above the base fill (so a highlighted polygon paints
  // over every other station's) while keeping both still under the route
  // line and station dots.
  if (map.getLayer(ROUTE_LINE_LAYER_ID)) {
    map.addLayer(layer, ROUTE_LINE_LAYER_ID)
    map.addLayer(highlightLayer, ROUTE_LINE_LAYER_ID)
  } else {
    map.addLayer(layer)
    map.addLayer(highlightLayer)
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
