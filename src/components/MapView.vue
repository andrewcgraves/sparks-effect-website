<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Map, FullscreenControl } from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { egressStationSlugs, isochroneLayerModule, isochroneLegend, resolveIsochroneColors } from '../composables/useIsochroneLayer'
import { centerFromCorners, routeBoundsCorners, routeLayerModule } from '../composables/useRouteLayer'
import { originMarkerModule } from '../composables/useOriginMarker'
import { originWalkModule } from '../composables/useOriginWalkLayer'
import { RAW_STOP_LAYER_ID, stopPreviewModule } from '../composables/useStopPreviewLayer'
import type { StopPreviewPair } from '../composables/useStopPreviewLayer'
import { stopDragModule } from '../composables/useStopDrag'
import { stationHighlightModule } from '../composables/useStationHighlight'
import { mapModules } from '../composables/mapLifecycle'
import { ISOCHRONE_BOUNDS_CORNERS, ISOCHRONE_CENTER, isochroneBoundsCorners } from '../fixtures/isochrone'
import type { ChainResponse } from '../fixtures/isochrone'
import { resolveMapStyleUrl } from '../mapStyle'
import type { Route, Station, Service } from '../api/scenarios'
import type { SnapCoord as LatLng } from '../api/authoring/types'

const props = defineProps<{
  isochroneData: ChainResponse | null
  loading: boolean
  origin?: { lat: number; lng: number } | null
  routes: Route[]
  stations: Station[]
  services: Service[]
  hideIsochroneLegend?: boolean
  // Raw/snapped stop pairs for the service-authoring preview (draw the raw
  // pin, the snapped pin, and a leader line between them). Absent by default
  // — every other caller of this component leaves it unset.
  stopPreviewPairs?: StopPreviewPair[]
  // Arms click-to-place: while set, a click on the map reports its coordinates
  // through map-click instead of being ignored. The caller owns when it turns
  // off — stop authoring keeps it on for a run of clicks, origin picking drops
  // it after one — and says what the map is armed for through placementCue.
  placementArmed?: boolean
  placementCue?: string
  // The station the page has highlighted, which this map is only one source of
  // — the Time remaining card raises one too. Passed in rather than kept here
  // so both surfaces read the same single reference.
  activeStation?: string | null
}>()

const emit = defineEmits<{
  'map-click': [coord: LatLng]
  'stop-drag': [id: string, coord: LatLng]
  'stop-drag-end': [id: string, coord: LatLng]
  'station-hover': [slug: string | null]
}>()

const ORIGIN_SNAP_ZOOM = 9

/* Resolved once, from the CSS tokens, because MapLibre paints to WebGL and
   cannot read CSS variables. The legend reads the same values so the key and
   the fills can never drift apart. */
const isochroneColors = resolveIsochroneColors()
const legend = isochroneLegend(isochroneColors)

const mapContainer = ref<HTMLElement | null>(null)
let map: Map | null = null
let resizeObserver: ResizeObserver | null = null
let hasFittedToSegments = false
let hasFittedToRoutes = false
// Map state, not module state: whether the style is up. Every module asks for
// it, and none of them keeps its own copy.
let isMapLoaded = false
// The point last reported through map-click. A caller that turns a click into
// the origin hands that same point straight back as a prop, and flying to
// somewhere the user just clicked would only yank the view off what they were
// aiming at — so that one origin is left to arrive without a camera move.
let lastClickedPoint: LatLng | null = null

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

/* Routes load asynchronously from the scenario fetch, so this fit needs to
   run both on the initial map load and again whenever routes arrive later. */
function fitMapToRoutes(): boolean {
  const corners = routeBoundsCorners(props.routes)
  if (!corners) return false
  const fitted = applyBoundsFit(corners)
  if (fitted) hasFittedToRoutes = true
  return fitted
}

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

function fitMapToIsochrone(data: ChainResponse): void {
  if (!map || data.features.length === 0) return
  map.fitBounds(isochroneBoundsCorners(data.features), {
    padding: MAP_FIT_PADDING,
    duration: 800,
  })
  hasFittedToSegments = true
}

// Everything drawn on this map, in dependency order: stop dragging binds its
// listeners to the layer the stop preview creates, so the preview comes first.
// Each entry decides for itself when it is ready and what it owns; this
// component no longer keeps a flag per module or a guard per call site.
const stopPreviewPairs = () => props.stopPreviewPairs ?? null

const idleCursor = () => (props.placementArmed ? 'crosshair' : '')

const modules = mapModules([
  routeLayerModule(
    () => ({ routes: props.routes, stations: props.stations }),
    () => props.isochroneData,
    isochroneColors.egress,
  ),
  isochroneLayerModule(() => props.isochroneData, isochroneColors),
  // After the isochrone, so the walk is drawn over the fill it crosses rather
  // than under it, and in the same blue: it is the rider's own walk, which is
  // what the origin fill is already about.
  originWalkModule({ data: () => props.isochroneData }, isochroneColors.origin),
  originMarkerModule(() => props.origin),
  // After the isochrone: it dims and un-dims those layers' fill-opacity, which
  // only exist once isochroneLayerModule has attached them. Also after
  // routeLayerModule, whose station dots it binds its listeners to. It reads
  // the plot too, to tell a station with a polygon to promote from one without.
  stationHighlightModule({
    idleCursor,
    egressSlugs: () => egressStationSlugs(props.isochroneData),
    activeSlug: () => props.activeStation ?? null,
    onHover: (slug) => emit('station-hover', slug),
  }),
  stopPreviewModule(stopPreviewPairs),
  stopDragModule(stopPreviewPairs, {
    onDrag: (id, coord) => emit('stop-drag', id, coord),
    onDragEnd: (id, coord) => emit('stop-drag-end', id, coord),
    idleCursor,
  }),
])

function syncModules(): void {
  if (map) modules.sync(map, isMapLoaded)
}

// MapLibre suppresses its own click event when the pointer travelled further
// than its click tolerance between press and release, so a drag-pan can never
// reach here — panning an armed map does not drop a stop. Placing one only
// mutates the caller's stop list; nothing here re-fits or re-centres the view.
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

// A crosshair marks the armed map, and double-click zoom steps aside so a
// double-click cannot both place a stop and zoom. The cursor is set on the
// canvas because MapLibre writes it inline, where a stylesheet can't reach.
function applyPlacementMode(): void {
  if (!map) return
  map.getCanvas().style.cursor = props.placementArmed ? 'crosshair' : ''
  if (props.placementArmed) map.doubleClickZoom.disable()
  else map.doubleClickZoom.enable()
}

watch(() => props.placementArmed, applyPlacementMode)

// The camera is this component's own: it owns the viewport, and no module has
// any business moving it. What follows is only about where to look.
watch(
  () => props.isochroneData,
  (data) => {
    if (!data || !isMapLoaded) return
    fitMapToIsochrone(data)
  },
)

watch(
  () => props.origin,
  (coords) => {
    if (!coords || !isMapLoaded) return
    const wasJustClicked = lastClickedPoint?.lat === coords.lat && lastClickedPoint?.lng === coords.lng
    lastClickedPoint = null
    if (wasJustClicked) return
    snapMapToOrigin(coords)
  },
)

watch(
  () => props.routes,
  (routes) => {
    if (!isMapLoaded || props.isochroneData || props.origin || hasFittedToRoutes) return
    if (routes.length > 0) fitMapToRoutes()
  },
)

onMounted(() => {
  if (!mapContainer.value) return

  const initialRouteCorners = routeBoundsCorners(props.routes)
  const initialCenter: [number, number] = initialRouteCorners
    ? centerFromCorners(initialRouteCorners)
    : ISOCHRONE_CENTER

  map = new Map({
    container: mapContainer.value,
    style: resolveMapStyleUrl(),
    center: initialCenter,
    zoom: 7,
  })

  map.addControl(new FullscreenControl())

  map.on('click', handleMapClick)

  // Attaches whatever does not need the style — the origin marker is a DOM
  // element over the canvas, and waiting for load would make the pin arrive
  // late on a page that already knows where it is.
  syncModules()

  map.on('load', () => {
    if (!map) return
    isMapLoaded = true

    syncModules()
    applyPlacementMode()

    if (props.isochroneData) {
      fitMapToIsochrone(props.isochroneData)
    } else if (props.origin) {
      snapMapToOrigin(props.origin)
    } else {
      fitMapToDefaultView()
    }
  })

  resizeObserver = new ResizeObserver(() => {
    if (!map || !mapContainer.value) return
    const { clientWidth, clientHeight } = mapContainer.value
    if (clientWidth === 0 || clientHeight === 0) return
    map.resize()
    if (!hasFittedToSegments) {
      fitMapToDefaultView()
    }
  })
  resizeObserver.observe(mapContainer.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  // Modules first: they release what would outlive the map, and map.remove()
  // takes the sources, layers, and map-bound listeners with it.
  modules.detach()
  map?.remove()
  map = null
})
</script>

<template>
  <div class="map-frame relative h-full min-h-[70vh] w-full rounded-(--radius-box) border border-border">
    <div
      ref="mapContainer"
      class="h-full min-h-[70vh] w-full"
    />
    <div
      v-if="loading"
      class="font-body pointer-events-none absolute inset-0 z-2 flex items-center justify-center gap-2.5 bg-white/65 text-[15px] text-ink"
      data-testid="map-loading"
      aria-live="polite"
      aria-label="Generating isochrone"
    >
      <span class="size-5 shrink-0 animate-spin rounded-full border-3 border-border border-t-coral" />
      <span>Generating isochrone…</span>
    </div>
    <!-- Persistent while armed, because arming outlives the click that
         triggered it: without a standing cue there is nothing on screen to
         explain why the map is in a different mode. Takes the free top-left
         corner from the isochrone key, which yields to it while armed. -->
    <p
      v-if="placementArmed && placementCue"
      class="font-body text-caption pointer-events-none absolute top-3 left-3 z-1 rounded-(--radius-field) bg-white/92 px-3 py-2 text-ink shadow-(--shadow-panel)"
      data-testid="map-placement-cue"
      aria-live="polite"
    >
      {{ placementCue }}
    </p>
    <!-- Top-left is the only corner MapLibre leaves free: attribution takes the
         bottom (wrapping to two lines when narrow) and the fullscreen control
         the top-right. Anywhere else the key's second row gets covered. -->
    <aside
      v-if="!hideIsochroneLegend && !placementArmed"
      class="absolute top-3 left-3 z-1 rounded-(--radius-field) bg-white/92 px-3 py-2.5 shadow-(--shadow-panel)"
      aria-label="Isochrone color key"
    >
      <p class="font-body text-micro mb-1.5 text-ink-muted italic uppercase">
        Isochrone key
      </p>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        <li
          v-for="entry in legend"
          :key="entry.source"
          class="font-body text-caption flex items-center gap-2 text-ink"
        >
          <span
            class="inline-block size-3.5 shrink-0 rounded-[3px] opacity-85"
            :style="{ backgroundColor: entry.color }"
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

/* MapLibre renders its own controls and attribution into the map container, so
   utilities can't reach them — this is the ":deep() exception", not leftover BEM. */
.map-frame :deep(.maplibregl-ctrl-group) {
  border-radius: var(--radius-field);
  box-shadow: var(--shadow-panel);
}

.map-frame :deep(.maplibregl-ctrl-group button + button) {
  border-top-color: var(--color-border);
}

.map-frame :deep(.maplibregl-ctrl-attrib) {
  font-family: var(--font-body);
  font-size: var(--text-micro);
}

.map-frame :deep(.maplibregl-ctrl-attrib a) {
  color: var(--color-ink-muted);
}
</style>
