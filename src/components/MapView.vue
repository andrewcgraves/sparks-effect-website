<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { FullscreenControl, type Map } from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import { egressStationSlugs, isochroneLegend, resolveIsochroneColors } from '../composables/useIsochroneLayer'
import { centerFromCorners, routeBoundsCorners } from '../composables/useRouteLayer'
import { originWalkLine } from '../composables/useOriginWalkLayer'
import { createSiteMap, splashZoneModules } from '../composables/siteMap'
import { RAW_STOP_LAYER_ID, stopPreviewModule } from '../composables/useStopPreviewLayer'
import type { StopPreviewPair } from '../composables/useStopPreviewLayer'
import { stopDragModule } from '../composables/useStopDrag'
import { stationHighlightModule } from '../composables/useStationHighlight'
import { mapModules } from '../composables/mapLifecycle'
import { ISOCHRONE_BOUNDS_CORNERS, ISOCHRONE_CENTER, isochroneBoundsCorners } from '../fixtures/isochrone'
import type { ChainResponse } from '../fixtures/isochrone'
import type { Route, Station } from '../api/scenarios'
import type { SnapCoord as LatLng } from '../api/authoring/types'
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'
import KeySwatch from './KeySwatch.vue'
import { UNNAMED_STATION } from '../copy/names'
import { reportError } from '../errorReporting'
import { MAP_LOAD_TIMEOUT_MS } from './mapLoad'

const props = defineProps<{
  isochroneData: ChainResponse | null
  loading: boolean
  loadingMessage?: string
  origin?: { lat: number; lng: number } | null
  routes: Route[]
  stations: Station[]
  hideIsochroneLegend?: boolean
  stopPreviewPairs?: StopPreviewPair[]
  placementArmed?: boolean
  placementCue?: string
  centerOn?: LatLng | null
  activeStation?: string | null
  remainingSecs?: (slug: string) => number | null
  label: string
  // For a phone page that gives the map the screen rather than a card.
  flush?: boolean
  // What still works on this page when the map cannot be drawn.
  withoutMap?: string
}>()

const emit = defineEmits<{
  'map-click': [coord: LatLng]
  'stop-drag': [id: string, coord: LatLng]
  'stop-drag-end': [id: string, coord: LatLng]
  'stop-hover': [id: string | null]
  'station-hover': [slug: string | null]
}>()

const ORIGIN_SNAP_ZOOM = 9
const STOP_FOCUS_ZOOM = 12

const isochroneColors = resolveIsochroneColors()
const legend = computed(() =>
  isochroneLegend({
    unfinished: (props.isochroneData?.metadata.trip_progress?.length ?? 0) > 0,
    starterWalk: originWalkLine(props.isochroneData) !== null,
  }),
)

const mapContainer = ref<HTMLElement | null>(null)
let map: Map | null = null
let resizeObserver: ResizeObserver | null = null
let resizeFrame: number | null = null
let hasFittedToSegments = false
let hasFittedToRoutes = false
const isMapLoaded = ref(false)
let lastClickedPoint: LatLng | null = null

type MapFailure = 'no-webgl' | 'style' | 'timeout'
const mapFailure = ref<MapFailure | null>(null)
let loadTimeout: ReturnType<typeof setTimeout> | null = null

const failureMessage = computed(() => {
  if (!mapFailure.value) return ''
  const why = mapFailure.value === 'no-webgl' ? "This browser can't draw the map." : "The map couldn't load."
  return props.withoutMap ? `${why} ${props.withoutMap}` : why
})

function clearLoadTimeout(): void {
  if (loadTimeout) clearTimeout(loadTimeout)
  loadTimeout = null
}

// A tab opened in the background draws no frames, so its map cannot load
// until it is looked at; that is not a map that failed.
function armLoadTimeout(): void {
  loadTimeout = setTimeout(() => {
    if (document.visibilityState === 'hidden') return armLoadTimeout()
    failMap('timeout', new Error(`Map did not load within ${MAP_LOAD_TIMEOUT_MS} ms`))
  }, MAP_LOAD_TIMEOUT_MS)
}

// Once per map: a style that cannot be fetched is usually followed by its
// sprite, glyphs and tiles failing too, and the first of them is the story.
function failMap(kind: MapFailure, error: unknown): void {
  clearLoadTimeout()
  if (isMapLoaded.value || mapFailure.value) return
  mapFailure.value = kind
  reportError(error, { map_failure: kind })
}

const MAP_FIT_PADDING = { top: 56, bottom: 112, left: 56, right: 56 }

function applyBoundsFit(corners: [[number, number], [number, number]]): boolean {
  if (!map) return false
  map.resize()
  map.fitBounds(corners, {
    padding: MAP_FIT_PADDING,
    duration: 0,
    maxZoom: 11,
  })
  hasFittedToSegments = true
  return true
}

function fitMapToStaticFallback(): void {
  applyBoundsFit(ISOCHRONE_BOUNDS_CORNERS)
}

function fitMapToRoutes(): boolean {
  const corners = routeBoundsCorners(props.routes)
  if (!corners) return false
  const fitted = applyBoundsFit(corners)
  if (fitted) hasFittedToRoutes = true
  return fitted
}

// The rider asked for it, so the frame moves visibly rather than jumping, and
// it is the network's frame even with a plot drawn: that is what was asked for.
function recenterOnRoutes(): void {
  const corners = routeBoundsCorners(props.routes)
  if (!map || !corners) return
  map.fitBounds(corners, {
    padding: MAP_FIT_PADDING,
    duration: 800,
    maxZoom: 11,
  })
}

const canRecenter = computed(() => isMapLoaded.value && props.routes.length > 0)

function fitMapToDefaultView(): void {
  if (fitMapToRoutes()) return
  fitMapToStaticFallback()
}

function snapMapToOrigin(coords: { lat: number; lng: number }): void {
  if (!map) return
  map.flyTo({
    center: [coords.lng, coords.lat],
    zoom: ORIGIN_SNAP_ZOOM,
  })
  hasFittedToSegments = true
}

function plotFrames(coords: { lat: number; lng: number }): boolean {
  const data = props.isochroneData
  if (!data || data.features.length === 0) return false
  const [[minLng, minLat], [maxLng, maxLat]] = isochroneBoundsCorners(data.features)
  return coords.lng >= minLng && coords.lng <= maxLng && coords.lat >= minLat && coords.lat <= maxLat
}

function fitMapToIsochrone(data: ChainResponse): void {
  if (!map || data.features.length === 0) return
  const corners = isochroneBoundsCorners(data.features)
  // fitBounds throws on a corner it cannot read, and the throw escapes the
  // watcher that called this — which is how one unreadable contour used to
  // leave the camera wherever the rider had left it (SPA-320). A frame that
  // cannot be computed is a frame not applied, not a dead watcher.
  if (!corners.flat().every(Number.isFinite)) return
  map.fitBounds(corners, {
    padding: MAP_FIT_PADDING,
    duration: 800,
  })
  hasFittedToSegments = true
}

const stopPreviewPairs = () => props.stopPreviewPairs ?? null

const idleCursor = () => (props.placementArmed ? 'crosshair' : '')

const { routeLayer, modules: plotModules } = splashZoneModules(
  {
    plot: () => props.isochroneData,
    routes: () => props.routes,
    stations: () => props.stations,
    origin: () => props.origin,
  },
  isochroneColors,
)

const stationHighlight = stationHighlightModule({
  idleCursor,
  egressSlugs: () => egressStationSlugs(props.isochroneData),
  activeSlug: () => props.activeStation ?? null,
  remainingSecs: (slug) => props.remainingSecs?.(slug) ?? null,
  stationName: (slug) => props.stations.find((s) => s.slug === slug)?.name ?? UNNAMED_STATION,
  onHover: (slug) => emit('station-hover', slug),
})
stationHighlight.requires = [routeLayer]

const stopPreview = stopPreviewModule(stopPreviewPairs)

const stopDrag = stopDragModule(stopPreviewPairs, {
  onDrag: (id, coord) => emit('stop-drag', id, coord),
  onDragEnd: (id, coord) => emit('stop-drag-end', id, coord),
  onHover: (id) => emit('stop-hover', id),
  idleCursor,
})
stopDrag.requires = [stopPreview]

const modules = mapModules([
  ...plotModules,
  stationHighlight,
  stopPreview,
  stopDrag,
])

function syncModules(): void {
  if (map) modules.sync(map, isMapLoaded.value)
}

function handleMapClick(event: MapMouseEvent): void {
  if (!props.placementArmed) return
  // A press on a pin is a reposition, not a placement — a drag shorter than
  // MapLibre's click tolerance still arrives here as a click, and stacking a
  // new stop on top of the one being nudged is never what was meant.
  if (map?.getLayer(RAW_STOP_LAYER_ID) && map.queryRenderedFeatures(event.point, { layers: [RAW_STOP_LAYER_ID] }).length > 0) {
    return
  }
  lastClickedPoint = { lat: event.lngLat.lat, lng: event.lngLat.lng }
  emit('map-click', lastClickedPoint)
}

function applyPlacementMode(): void {
  if (!map) return
  map.getCanvas().style.cursor = props.placementArmed ? 'crosshair' : ''
  if (props.placementArmed) map.doubleClickZoom.disable()
  else map.doubleClickZoom.enable()
}

watch(() => props.placementArmed, applyPlacementMode)

// Zooms in only as far as a stop can be told from its neighbours, never out.
function flyToStop(coord: LatLng): void {
  if (!map) return
  map.flyTo({
    center: [coord.lng, coord.lat],
    zoom: Math.max(map.getZoom(), STOP_FOCUS_ZOOM),
  })
}

// Watched by identity, not by value: asking for the same stop again, after
// panning away from it, has to move the map back. A stop asked for before the
// map has loaded is flown to once it has.
watch(
  () => props.centerOn,
  (coord) => {
    if (!coord || !isMapLoaded.value) return
    flyToStop(coord)
  },
)

watch(
  () => props.isochroneData,
  (data) => {
    if (!data || !isMapLoaded.value) return
    fitMapToIsochrone(data)
  },
)

watch(
  () => props.origin,
  (coords) => {
    if (!coords || !isMapLoaded.value) return
    const wasJustClicked = lastClickedPoint?.lat === coords.lat && lastClickedPoint?.lng === coords.lng
    lastClickedPoint = null
    if (wasJustClicked) return
    // A pin inside the drawn splash zone is already on screen in its frame, and
    // a saved splash zone moves the pin to its starting point as it is drawn:
    // snapping in on the pin there would undo the fit that shows all of it.
    if (plotFrames(coords)) return
    snapMapToOrigin(coords)
  },
)

watch(
  () => props.routes,
  (routes) => {
    if (!isMapLoaded.value || props.isochroneData || props.origin || hasFittedToRoutes) return
    if (routes.length > 0) fitMapToRoutes()
  },
)

onMounted(() => {
  if (!mapContainer.value) return

  const initialRouteCorners = routeBoundsCorners(props.routes)
  const initialCenter: [number, number] = initialRouteCorners
    ? centerFromCorners(initialRouteCorners)
    : ISOCHRONE_CENTER

  // maplibre-gl 6 needs WebGL2 and throws from the constructor without it —
  // hardware acceleration off, a blocklisted GPU, many remote desktops. The
  // rest of the page does not need the map, so this is said and not thrown.
  try {
    map = createSiteMap({
      container: mapContainer.value,
      center: initialCenter,
      zoom: 7,
      // A carded map is most of a laptop screen, and a visitor scrolling to
      // the form or results lands on it; a plain scroll or one-finger drag
      // moves the page and ⌘/Ctrl + scroll or two fingers move the map.
      // Fullscreen lifts this until it is left. A flush map is the whole phone
      // page, so it keeps direct gestures.
      cooperativeGestures: !props.flush,
    })
  } catch (error) {
    failMap('no-webgl', error)
    return
  }

  map.addControl(new FullscreenControl())

  // Before load, an error is the style or a source failing to arrive, and the
  // map will not draw without it. After load it is a stray tile, which
  // MapLibre already logs and draws around.
  map.on('error', (event: { error?: unknown }) => {
    if (isMapLoaded.value) return
    failMap('style', event.error ?? event)
  })
  armLoadTimeout()

  map.on('click', handleMapClick)

  // Attaches whatever does not need the style — the origin marker is a DOM
  // element over the canvas, and waiting for load would make the pin arrive
  // late on a page that already knows where it is.
  syncModules()

  map.on('load', () => {
    if (!map) return
    clearLoadTimeout()
    // A slow map given up on is still a map: if it arrives, draw it.
    mapFailure.value = null
    isMapLoaded.value = true

    syncModules()
    applyPlacementMode()

    if (props.isochroneData) {
      fitMapToIsochrone(props.isochroneData)
    } else if (props.origin) {
      snapMapToOrigin(props.origin)
    } else {
      fitMapToDefaultView()
    }
    if (props.centerOn) flyToStop(props.centerOn)
  })

  // Each map.resize() reallocates the drawing buffer, and a container that is
  // animating reports a new size on every frame, sometimes more than once.
  resizeObserver = new ResizeObserver(() => {
    if (resizeFrame !== null) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null
      if (!map || !mapContainer.value) return
      const { clientWidth, clientHeight } = mapContainer.value
      if (clientWidth === 0 || clientHeight === 0) return
      map.resize()
      if (!hasFittedToSegments) {
        fitMapToDefaultView()
      }
    })
  })
  resizeObserver.observe(mapContainer.value)
})

onUnmounted(() => {
  clearLoadTimeout()
  resizeObserver?.disconnect()
  resizeObserver = null
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
  resizeFrame = null
  // Modules first: they release what would outlive the map, and map.remove()
  // takes the sources, layers, and map-bound listeners with it.
  modules.detach()
  map?.remove()
  map = null
})
</script>

<template>
  <div
    class="map-frame relative h-full w-full"
    :class="flush ? 'map-frame-flush' : 'min-h-[70vh] rounded-(--radius-box) border border-border'"
    role="region"
    :aria-label="label"
  >
    <div
      ref="mapContainer"
      class="h-full w-full"
      :class="flush ? '' : 'min-h-[70vh]'"
    />
    <LoadingRegion
      v-if="!isMapLoaded && !mapFailure"
      label="Loading map"
      class="pointer-events-none absolute inset-0 z-1"
      data-testid="map-skeleton"
    >
      <SkeletonShape
        shape="block"
        class="size-full"
      />
    </LoadingRegion>
    <!-- Always in the page so a screen reader is listening before the
         message arrives; a live region inserted with its text is often not
         announced. -->
    <div
      role="status"
      class="pointer-events-none absolute inset-0 z-1 flex items-center justify-center p-6"
      :class="{ 'bg-surface': mapFailure }"
    >
      <p
        v-if="mapFailure"
        class="t-body max-w-sm text-center text-ink"
        data-testid="map-failed"
      >
        {{ failureMessage }}
      </p>
    </div>
    <div
      v-if="loading"
      class="t-body pointer-events-none absolute inset-0 z-2 flex items-center justify-center gap-2.5 bg-white/92 text-ink"
      data-testid="map-loading"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        class="size-5 shrink-0 animate-spin rounded-full border-3 border-border border-t-coral"
        aria-hidden="true"
      />
      <span>{{ loadingMessage ?? 'Waiting…' }}</span>
    </div>
    
    <!-- Sits in MapLibre's top-right control column, one button and its 10px
         margin below the fullscreen control: 29px, or 40px on the flush phone
         map where the controls are sized for a thumb. -->
    <button
      v-if="canRecenter"
      type="button"
      class="absolute right-2.5 z-1 flex cursor-pointer items-center justify-center rounded-(--radius-field) bg-white text-ink shadow-(--shadow-panel)"
      :class="flush ? 'top-[60px] size-10' : 'top-[49px] size-[29px]'"
      aria-label="Recenter map on the route"
      title="Recenter on the route"
      data-testid="map-recenter"
      @click="recenterOnRoutes"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        class="size-[18px] fill-none stroke-current stroke-[1.75]"
      >
        <circle
          cx="10"
          cy="10"
          r="5.5"
        />
        <circle
          cx="10"
          cy="10"
          r="1.5"
          class="fill-current"
        />
        <path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" />
      </svg>
    </button>

    <p
      v-if="placementArmed && placementCue"
      class="t-meta pointer-events-none absolute top-3 left-3 z-1 rounded-(--radius-field) bg-white/92 px-3 py-2 text-ink shadow-(--shadow-panel)"
      data-testid="map-placement-cue"
      aria-live="polite"
    >
      {{ placementCue }}
    </p>
    
    <aside
      v-if="!hideIsochroneLegend && !placementArmed && !mapFailure"
      class="absolute top-3 left-3 z-1 rounded-(--radius-field) bg-white/92 px-3 py-2.5 shadow-(--shadow-panel)"
      aria-label="Splash zone color key"
    >
      <p class="t-eyebrow mb-1.5 text-ink-muted">
        Splash zone key
      </p>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        <li
          v-for="entry in legend"
          :key="entry.source"
          class="t-meta flex items-center gap-2 text-ink"
        >
          <KeySwatch
            :kind="entry.source"
            class="shrink-0"
            :data-testid="`legend-swatch-${entry.source}`"
          />
          <span>{{ entry.label }}</span>
        </li>
      </ul>
    </aside>
  </div>
</template>

<style scoped>
/* The map box is the mask: MapLibre's canvas is a WebGL layer that gets its
   own compositor layer, and `overflow: hidden` on an ancestor does not
   reliably clip a layer like that in every browser — the isochrone fill paints
   past the rounded corner and square edges show through. `clip-path` forces a
   true per-pixel clip of the composited output instead of relying on layout
   overflow, so the fill is masked to the box's rounded shape everywhere,
   including where an isochrone runs up against the edge of the map. */
.map-frame {
  overflow: hidden;
  clip-path: inset(0 round var(--radius-box));
}

.map-frame-flush {
  clip-path: none;
}

/* MapLibre renders its own controls and attribution into the map container, so
   utilities can't reach them — this is the ":deep() exception", not leftover BEM. */
.map-frame :deep(.maplibregl-ctrl-group) {
  border-radius: var(--radius-field);
  box-shadow: var(--shadow-panel);
}

.map-frame :deep(.maplibregl-ctrl-group button + button) {
  border-top-color: var(--color-border);
}

.map-frame-flush :deep(.maplibregl-ctrl-group button) {
  width: 40px;
  height: 40px;
}

.map-frame :deep(.maplibregl-ctrl-attrib) {
  font-family: var(--font-body);
  font-size: var(--text-micro);
}

.map-frame :deep(.maplibregl-ctrl-attrib a) {
  color: var(--color-ink-muted);
}

/* MapLibre's own 40% black scrim leaves its white hint near 3:1 over the pale
   basemap; ink at 65% clears 4.5:1 there. */
.map-frame :deep(.maplibregl-cooperative-gesture-screen) {
  background: color-mix(in srgb, var(--color-ink) 65%, transparent);
  font-family: var(--font-body);
  font-size: var(--text-body);
  text-align: center;
}
</style>
