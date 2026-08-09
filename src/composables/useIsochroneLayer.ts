import type { ExpressionSpecification, FillLayerSpecification, GeoJSONSource, LineLayerSpecification, Map } from 'maplibre-gl'
import type { MapModule } from './mapLifecycle'
import type { FeatureCollection } from 'geojson'
import { readThemeToken } from '../themeTokens'
import { ROUTE_LINE_LAYER_ID } from './useRouteLayer'

export const ISOCHRONE_SOURCE_ID = 'isochrone-source'

// The rider's own reach from the origin, on its own layer *below* every egress
// polygon. Origin and egress used to share one fill layer, told apart by a
// match on `source`, which left their stacking at the mercy of the order the
// worker happened to emit features in — MapLibre paints one layer's features
// in source-array order. On a large driving plot the blue origin polygon
// covers the whole map, so whenever it landed after the egress polygons it
// painted over the very isochrone the rider was trying to read (SPA-224).
// Splitting by source makes the stack the layer order, which we own.
export const ISOCHRONE_ORIGIN_LAYER_ID = 'isochrone-origin-fill'

// Every station's egress polygon.
export const ISOCHRONE_LAYER_ID = 'isochrone-fill'

// Draws only the hovered/selected station's egress polygon, filtered from the
// same source, stacked above ISOCHRONE_LAYER_ID. Opacity alone can't promote
// a feature above its overlapping neighbours — MapLibre paints one layer's
// features in source-array order regardless of fill-opacity — so bringing a
// polygon "to the top" needs a second layer rather than a paint tweak
// (SPA-211 follow-up).
export const ISOCHRONE_HIGHLIGHT_LAYER_ID = 'isochrone-highlight-fill'

// The same polygon's edge, stroked at full strength on top of the fill. A
// translucent fill promoted over another translucent fill differs only by a
// blend; a hard edge says which polygon is being singled out no matter what
// is underneath it (SPA-224).
export const ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID = 'isochrone-highlight-outline'

export const ISOCHRONE_FILL_OPACITY = 0.35

// Used while a station is hovered or selected: its own egress isochrone reads
// clearly above the rest, drawn again by ISOCHRONE_HIGHLIGHT_LAYER_ID, while
// every other egress polygon fades out of the way instead of fighting it for
// the same patch of map (SPA-211).
export const ISOCHRONE_HIGHLIGHT_OPACITY = 0.8
export const ISOCHRONE_DIM_OPACITY = 0.08

// The origin fill fades too, rather than holding its full 0.35 as it did
// before SPA-224. It is a different thing from a station's reach — the
// rider's own — but on a large driving plot it is also a full-map blue wash,
// and the promoted orange composited through it read as a muted tan rather
// than the orange in the legend. It stays visible, just out of the way, and
// comes back the moment the pointer leaves.
export const ISOCHRONE_ORIGIN_DIM_OPACITY = 0.12

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
 * The fill-opacity for the egress layer.
 *
 * `false` is the plain, pre-SPA-211 opacity every feature shared. `true`
 * dims every egress polygon uniformly, regardless of which station is
 * highlighted — that station's own polygon is repainted at full strength by
 * ISOCHRONE_HIGHLIGHT_LAYER_ID, on top of this one, so this layer never needs
 * to know which slug is highlighted. A flat number rather than the `case`
 * expression this used to be: since SPA-224 the origin lives on its own
 * layer, so there is no second source to tell apart here.
 */
export function isochroneEgressOpacity(dimmed: boolean): number {
  return dimmed ? ISOCHRONE_DIM_OPACITY : ISOCHRONE_FILL_OPACITY
}

/** The fill-opacity for the origin layer, dimmed while a station is highlighted. */
export function isochroneOriginOpacity(dimmed: boolean): number {
  return dimmed ? ISOCHRONE_ORIGIN_DIM_OPACITY : ISOCHRONE_FILL_OPACITY
}

/**
 * The station slugs the plot actually drew an egress polygon for.
 *
 * Not the same list as `metadata.reachable_stations`: a station can be lit as
 * reachable and still have no polygon in the collection. Highlighting such a
 * station used to dim every other isochrone and promote nothing, leaving the
 * blue origin fill alone on screen — the "sometimes" in SPA-224. Callers use
 * this to leave the map alone instead.
 */
export function egressStationSlugs(data: FeatureCollection | null): Set<string> {
  const slugs = new Set<string>()
  for (const feature of data?.features ?? []) {
    const { source, station_slug: slug } = (feature.properties ?? {}) as Record<string, unknown>
    if (source === 'egress' && typeof slug === 'string' && slug.length > 0) slugs.add(slug)
  }
  return slugs
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

  const originLayer: FillLayerSpecification = {
    id: ISOCHRONE_ORIGIN_LAYER_ID,
    type: 'fill',
    source: ISOCHRONE_SOURCE_ID,
    filter: ['==', ['get', 'source'], 'origin'],
    paint: {
      'fill-color': colors.origin,
      'fill-opacity': isochroneOriginOpacity(false),
    },
  }

  const layer: FillLayerSpecification = {
    id: ISOCHRONE_LAYER_ID,
    type: 'fill',
    source: ISOCHRONE_SOURCE_ID,
    filter: ['==', ['get', 'source'], 'egress'],
    paint: {
      'fill-color': colors.egress,
      'fill-opacity': isochroneEgressOpacity(false),
    },
  }

  // Only egress polygons are ever highlighted, so these need no per-source
  // filter of their own — and they start filtered to nothing, since attaching
  // happens before any station has been hovered or clicked.
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

  const highlightOutlineLayer: LineLayerSpecification = {
    id: ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
    type: 'line',
    source: ISOCHRONE_SOURCE_ID,
    filter: isochroneHighlightFilter(null),
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': colors.egress,
      'line-width': 2,
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
  // All four go in with the same beforeId, so they stack in the order they are
  // added and the whole group stays under the route line and station dots:
  // origin fill, every station's egress fill, the highlighted station's fill,
  // then its outline on top.
  const stack = [originLayer, layer, highlightLayer, highlightOutlineLayer]
  const beforeId = map.getLayer(ROUTE_LINE_LAYER_ID) ? ROUTE_LINE_LAYER_ID : undefined
  for (const entry of stack) {
    if (beforeId) map.addLayer(entry, beforeId)
    else map.addLayer(entry)
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
