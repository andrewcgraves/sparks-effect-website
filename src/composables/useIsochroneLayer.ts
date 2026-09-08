import type { ExpressionSpecification, FillLayerSpecification, GeoJSONSource, LineLayerSpecification, Map } from 'maplibre-gl'
import type { MapModule } from './mapLifecycle'
import type { FeatureCollection } from 'geojson'
import { readThemeToken } from '../themeTokens'
import { ROUTE_LINE_LAYER_ID } from './useRouteLayer'

export const ISOCHRONE_SOURCE_ID = 'isochrone-source'

export const ISOCHRONE_ORIGIN_LAYER_ID = 'isochrone-origin-fill'

export const ISOCHRONE_LAYER_ID = 'isochrone-fill'

export const ISOCHRONE_HIGHLIGHT_LAYER_ID = 'isochrone-highlight-fill'

export const ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID = 'isochrone-highlight-outline'

export const ISOCHRONE_FILL_OPACITY = 0.35

export const ISOCHRONE_HIGHLIGHT_OPACITY = 0.8
export const ISOCHRONE_DIM_OPACITY = 0.08

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

export function isochroneEgressOpacity(dimmed: boolean): number {
  return dimmed ? ISOCHRONE_DIM_OPACITY : ISOCHRONE_FILL_OPACITY
}

export function isochroneOriginOpacity(dimmed: boolean): number {
  return dimmed ? ISOCHRONE_ORIGIN_DIM_OPACITY : ISOCHRONE_FILL_OPACITY
}

export function egressStationSlugs(data: FeatureCollection | null): Set<string> {
  const slugs = new Set<string>()
  for (const feature of data?.features ?? []) {
    const { source, station_slug: slug } = (feature.properties ?? {}) as Record<string, unknown>
    if (source === 'egress' && typeof slug === 'string' && slug.length > 0) slugs.add(slug)
  }
  return slugs
}

const MATCH_NO_STATION: ExpressionSpecification = ['in', ['get', 'station_slug'], ['literal', []]]

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
