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
  stopPreviewPairs?: StopPreviewPair[]
  placementArmed?: boolean
  placementCue?: string
  activeStation?: string | null
}>()

const emit = defineEmits<{
  'map-click': [coord: LatLng]
  'stop-drag': [id: string, coord: LatLng]
  'stop-drag-end': [id: string, coord: LatLng]
  'station-hover': [slug: string | null]
}>()

const ORIGIN_SNAP_ZOOM = 9

const isochroneColors = resolveIsochroneColors()
const legend = isochroneLegend(isochroneColors)

const mapContainer = ref<HTMLElement | null>(null)
let map: Map | null = null
let resizeObserver: ResizeObserver | null = null
let hasFittedToSegments = false
let hasFittedToRoutes = false
let isMapLoaded = false
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

const stopPreviewPairs = () => props.stopPreviewPairs ?? null

const idleCursor = () => (props.placementArmed ? 'crosshair' : '')

const routeLayer = routeLayerModule(
  () => ({ routes: props.routes, stations: props.stations }),
  () => props.isochroneData,
  isochroneColors.egress,
)

const stationHighlight = stationHighlightModule({
  idleCursor,
  egressSlugs: () => egressStationSlugs(props.isochroneData),
  activeSlug: () => props.activeStation ?? null,
  onHover: (slug) => emit('station-hover', slug),
})
stationHighlight.requires = [routeLayer]

const stopPreview = stopPreviewModule(stopPreviewPairs)

const stopDrag = stopDragModule(stopPreviewPairs, {
  onDrag: (id, coord) => emit('stop-drag', id, coord),
  onDragEnd: (id, coord) => emit('stop-drag-end', id, coord),
  idleCursor,
})
stopDrag.requires = [stopPreview]

const modules = mapModules([
  routeLayer,
  isochroneLayerModule(() => props.isochroneData, isochroneColors),
  originWalkModule({ data: () => props.isochroneData }, isochroneColors.origin),
  originMarkerModule(() => props.origin),
  stationHighlight,
  stopPreview,
  stopDrag,
])

function syncModules(): void {
  if (map) modules.sync(map, isMapLoaded)
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
    
    <p
      v-if="placementArmed && placementCue"
      class="font-body text-caption pointer-events-none absolute top-3 left-3 z-1 rounded-(--radius-field) bg-white/92 px-3 py-2 text-ink shadow-(--shadow-panel)"
      data-testid="map-placement-cue"
      aria-live="polite"
    >
      {{ placementCue }}
    </p>
    
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
