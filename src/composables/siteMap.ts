import { Map, setWorkerUrl, type MapOptions, type SourceSpecification, type StyleSpecification } from 'maplibre-gl'

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

// The map credits OpenStreetMap and nothing else (SPA-507); every other
// credit — 511, San Joaquin RTD, the tile host, OpenMapTiles, MapLibre — lives
// in the footer and on /attribution, which every footer links. Giving the
// control options replaces MapLibre's default list, and `withoutSourceCredits`
// stops the style's TileJSON adding its own.
export const MAP_CREDITS = [
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
]

// A source's own options win over the TileJSON it points at, and the
// attribution control skips a blank credit, so a blank here hides the host's.
export function withoutSourceCredits(
  _previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  const sources = Object.fromEntries(
    Object.entries(next.sources).map(([id, source]) => [id, { ...source, attribution: '' } as SourceSpecification]),
  )
  return { ...next, sources }
}

const MAX_PIXEL_RATIO = 2

// Out of callers' reach, so no page can turn tilting or turning back on.
type FlatMapOption = 'maxPitch' | 'dragRotate' | 'pitchWithRotate' | 'touchPitch' | 'rollEnabled'

export function createSiteMap(
  options: Omit<MapOptions, 'style' | 'attributionControl' | FlatMapOption>,
  credits: { compact?: boolean } = {},
): Map {
  const map = new Map({
    // Every map stays flat and north-up (SPA-498): splash zones and lines are
    // flat fills and lines, so a tilt or a turn only makes them harder to
    // read, and the recenter button and every fit keep the visitor's angle,
    // so nothing would undo one. Roll is already off by default. A
    // NavigationControl, if one is ever added, wants
    // `{ showCompass: false, visualizePitch: false }`.
    maxPitch: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
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
  // Neither has a constructor option. A two-finger twist still pans and
  // zooms; the keyboard one also stops Shift+↑/↓ pitching.
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  // The constructor's `style` option takes no transformStyle.
  map.setStyle(resolveMapStyleUrl(), { transformStyle: withoutSourceCredits })
  return map
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
