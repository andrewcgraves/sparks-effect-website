import type { FillLayerSpecification, GeoJSONSource, LineLayerSpecification, Map } from 'maplibre-gl'
import type { MapModule } from './mapLifecycle'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import * as polygonClippingModule from 'polygon-clipping'
import { readThemeToken } from '../themeTokens'
import { mapTrial, type MapTrial } from '../mapTrial'
import { addLayerInStack } from './layerStack'

// Its ES build exports one default object, while its types declare named exports.
const { union } = (polygonClippingModule as unknown as { default: typeof polygonClippingModule }).default

export const ISOCHRONE_SOURCE_ID = 'isochrone-source'

export const ISOCHRONE_HIGHLIGHT_SOURCE_ID = 'isochrone-highlight-source'

export const ISOCHRONE_ORIGIN_LAYER_ID = 'isochrone-origin-fill'

export const ISOCHRONE_LAYER_ID = 'isochrone-fill'

export const ISOCHRONE_HIGHLIGHT_LAYER_ID = 'isochrone-highlight-fill'

export const ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID = 'isochrone-highlight-outline'

export const ISOCHRONE_FILL_OPACITY = 0.35

export const ISOCHRONE_HIGHLIGHT_OPACITY = 0.8
export const ISOCHRONE_DIM_OPACITY = 0.08

export const ISOCHRONE_ORIGIN_DIM_OPACITY = 0.12

export const ISOCHRONE_LIFT_OPACITY = 0.2

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

export function isochroneLegend(drawn: { unfinished?: boolean; starterWalk?: boolean } = {}) {
  // One row for both fills: they are the same coral (SPA-521), so two rows
  // drew two identical boxes. Where an area was reached from is the tour's to
  // explain, not the key's.
  const entries: { source: 'origin' | 'starter' | 'unfinished'; label: string }[] = [
    { source: 'origin', label: 'Reachable in time' },
  ]
  // Unlabelled, the starter walk was the one line on the map anchored at the
  // origin and ending on a single station, painted above everything else — and
  // it read as the way to go (SPA-342). It is the first leg of one trip to the
  // quickest station; every other station was searched from too, and their
  // reach is already in the fills.
  if (drawn.starterWalk) {
    entries.push({ source: 'starter', label: 'First leg — nearest station' })
  }
  // Ink is also the network and the ridden path, so naming it "travel time ran
  // out" on a map with no stub invites the same misread this row is meant to close.
  if (drawn.unfinished) {
    entries.push({ source: 'unfinished', label: 'Travel time ran out here' })
  }
  return entries
}

export function isochroneEgressOpacity(dimmed: boolean): number {
  return dimmed ? ISOCHRONE_DIM_OPACITY : ISOCHRONE_FILL_OPACITY
}

export function isochroneOriginOpacity(dimmed: boolean): number {
  return dimmed ? ISOCHRONE_ORIGIN_DIM_OPACITY : ISOCHRONE_FILL_OPACITY
}

export function isochroneRestingOpacity(highlight: MapTrial['highlight'] = mapTrial.highlight): number {
  return highlight === 'lift' ? ISOCHRONE_LIFT_OPACITY : ISOCHRONE_FILL_OPACITY
}

export function egressStationSlugs(data: FeatureCollection | null): Set<string> {
  const slugs = new Set<string>()
  for (const feature of data?.features ?? []) {
    const { source, station_slug: slug } = (feature.properties ?? {}) as Record<string, unknown>
    if (source === 'egress' && typeof slug === 'string' && slug.length > 0) slugs.add(slug)
  }
  return slugs
}

const NO_FEATURES: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function isochroneHighlightData(data: FeatureCollection | null, slug: string | null): FeatureCollection {
  if (!data || !slug) return NO_FEATURES
  return {
    type: 'FeatureCollection',
    features: data.features.filter((feature) => {
      const { source, station_slug: featureSlug } = (feature.properties ?? {}) as Record<string, unknown>
      return source === 'egress' && featureSlug === slug
    }),
  }
}

export function flattenEgress(data: FeatureCollection): FeatureCollection {
  const egress: (Polygon | MultiPolygon)['coordinates'][] = []
  const rest: Feature[] = []
  for (const feature of data.features) {
    const { source } = (feature.properties ?? {}) as Record<string, unknown>
    const { geometry } = feature
    if (source === 'egress' && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
      egress.push(geometry.coordinates)
    } else {
      rest.push(feature)
    }
  }
  if (egress.length < 2) return data
  // Thirteen stations' polygons laid over each other at 35% are what cost an
  // older graphics chip its frame rate — the core is blended up to thirteen
  // times a frame. One merged shape is blended once (SPA-524).
  const [first, ...others] = egress as Parameters<typeof union>
  const merged: Feature<MultiPolygon> = {
    type: 'Feature',
    properties: { source: 'egress' },
    geometry: { type: 'MultiPolygon', coordinates: union(first, ...others) },
  }
  return { ...data, features: [...rest, merged] }
}

function splashZoneData(data: FeatureCollection, splash: MapTrial['splash']): FeatureCollection {
  return splash === 'flat' ? flattenEgress(data) : data
}

interface PlottedHighlight {
  data: FeatureCollection | null
  slug: string | null
}

const plotted = new WeakMap<Map, PlottedHighlight>()

export function showIsochroneHighlight(map: Map, slug: string | null): void {
  const state = plotted.get(map)
  if (!state || state.slug === slug) return
  state.slug = slug
  // A source of its own holding one station's polygon: filtering the full
  // source instead makes MapLibre rebuild every splash-zone tile on each
  // hover (SPA-524).
  const source = map.getSource(ISOCHRONE_HIGHLIGHT_SOURCE_ID) as GeoJSONSource | undefined
  source?.setData(isochroneHighlightData(state.data, slug))
}

export function useIsochroneLayer(
  map: Map,
  geojson: FeatureCollection,
  colors: IsochroneColors = resolveIsochroneColors(),
  trial: MapTrial = mapTrial,
): void {
  map.addSource(ISOCHRONE_SOURCE_ID, {
    type: 'geojson',
    data: splashZoneData(geojson, trial.splash),
  })
  map.addSource(ISOCHRONE_HIGHLIGHT_SOURCE_ID, {
    type: 'geojson',
    data: NO_FEATURES,
  })
  plotted.set(map, { data: geojson, slug: null })

  const originLayer: FillLayerSpecification = {
    id: ISOCHRONE_ORIGIN_LAYER_ID,
    type: 'fill',
    source: ISOCHRONE_SOURCE_ID,
    filter: ['==', ['get', 'source'], 'origin'],
    paint: {
      'fill-color': colors.origin,
      'fill-opacity': isochroneRestingOpacity(trial.highlight),
    },
  }

  const layer: FillLayerSpecification = {
    id: ISOCHRONE_LAYER_ID,
    type: 'fill',
    source: ISOCHRONE_SOURCE_ID,
    filter: ['==', ['get', 'source'], 'egress'],
    paint: {
      'fill-color': colors.egress,
      'fill-opacity': isochroneRestingOpacity(trial.highlight),
    },
  }

  // The highlight source only ever holds the one station's egress polygon, and
  // starts empty, since attaching happens before any station has been hovered
  // or clicked.
  const highlightLayer: FillLayerSpecification = {
    id: ISOCHRONE_HIGHLIGHT_LAYER_ID,
    type: 'fill',
    source: ISOCHRONE_HIGHLIGHT_SOURCE_ID,
    paint: {
      'fill-color': colors.egress,
      'fill-opacity': ISOCHRONE_HIGHLIGHT_OPACITY,
    },
  }

  const highlightOutlineLayer: LineLayerSpecification = {
    id: ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
    type: 'line',
    source: ISOCHRONE_HIGHLIGHT_SOURCE_ID,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': colors.egress,
      'line-width': 2,
    },
  }

  addLayerInStack(map, originLayer)
  addLayerInStack(map, layer)
  addLayerInStack(map, highlightLayer)
  addLayerInStack(map, highlightOutlineLayer)
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
      source?.setData(splashZoneData(geojson, mapTrial.splash))
      // A new plot can redraw the highlighted station's polygon, or drop it.
      const state = plotted.get(map)
      if (!state) return
      const slug = state.slug
      plotted.set(map, { data: geojson, slug: null })
      showIsochroneHighlight(map, slug)
    },
    detach: () => {},
  }
}
