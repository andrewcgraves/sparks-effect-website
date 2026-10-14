import { Map, setWorkerUrl, type MapOptions } from 'maplibre-gl'

// Re-exported so a page that loads the map lazily gets everything it needs
// from MapLibre through this one module.
export { Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Route, Station } from '../api/scenarios'
import type { ChainResponse } from '../fixtures/isochrone'
import { resolveMapStyleUrl } from '../mapStyle'
import { isochroneLayerModule, type IsochroneColors } from './useIsochroneLayer'
import type { MapModule } from './mapLifecycle'
import { originMarkerModule } from './useOriginMarker'
import { originWalkModule } from './useOriginWalkLayer'
import { routeLayerModule } from './useRouteLayer'

// maplibre-gl 6 finds its worker beside its own module via import.meta.url,
// which a Vite bundle breaks: the worker is never emitted and no tiles load.
// `?worker&url` emits it as a self-contained chunk; plain `?url` would drop
// the shared module the worker imports.
setWorkerUrl(maplibreWorkerUrl)

// Only the credits whose terms want them on the data sit on the map; the rest
// live on /attribution, which every footer links (SPA-495). 511's data
// agreement wants its credit "in visual proximity" to the data (SPA-419), and
// San Joaquin RTD's terms want its legend "prominently displayed" while its
// feeds are ingested; drop that entry (and the page's line) once
// GTFS_FEED_DENYLIST=886 2180 is set. The style's own TileJSON still adds the
// tile host, OpenMapTiles and OpenStreetMap. Giving the control options
// replaces MapLibre's default list, which drops MapLibre's own credit — its
// licence doesn't ask for one on the map, and /attribution carries it.
export const MAP_CREDITS = [
  '<a href="https://www.511.org" target="_blank" rel="noopener">Data provided by 511.org</a>',
  'Route and schedule data provided by permission of San Joaquin RTD',
]

const MAX_PIXEL_RATIO = 2

export function createSiteMap(
  options: Omit<MapOptions, 'style' | 'attributionControl'>,
  credits: { compact?: boolean } = {},
): Map {
  return new Map({
    style: resolveMapStyleUrl(),
    // Past 2× the extra sharpness is hard to see, and a 3× phone or laptop
    // pays more than twice 2×'s pixels for it on every frame (SPA-492).
    pixelRatio: Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO),
    // `compact` left unset by default: visible on load, folding behind ⓘ on a
    // phone once the map is touched.
    attributionControl: credits.compact === undefined
      ? { customAttribution: MAP_CREDITS }
      : { compact: credits.compact, customAttribution: MAP_CREDITS },
    ...options,
  })
}

export interface SplashZoneInputs {
  plot: () => ChainResponse | null
  routes: () => Route[]
  stations: () => Station[]
  origin: () => { lat: number; lng: number } | null | undefined
}

export function splashZoneModules(
  inputs: SplashZoneInputs,
  colors: IsochroneColors,
): { routeLayer: MapModule; modules: MapModule[] } {
  const routeLayer = routeLayerModule(
    () => ({ routes: inputs.routes(), stations: inputs.stations() }),
    inputs.plot,
    colors.egress,
  )
  return {
    routeLayer,
    modules: [
      routeLayer,
      isochroneLayerModule(inputs.plot, colors),
      originWalkModule({ data: inputs.plot }, colors.origin),
      originMarkerModule(inputs.origin),
    ],
  }
}
