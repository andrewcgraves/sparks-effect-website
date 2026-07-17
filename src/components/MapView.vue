<script setup lang="ts">
import { onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import { Map, FullscreenControl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ISOCHRONE_SOURCE_ID, isochroneLegend, resolveIsochroneColors, useIsochroneLayer } from '../composables/useIsochroneLayer'
import { useRouteLayer } from '../composables/useRouteLayer'
import { useOriginMarker } from '../composables/useOriginMarker'
import { ISOCHRONE_BOUNDS_CORNERS, ISOCHRONE_CENTER, isochroneBoundsCorners } from '../fixtures/isochrone'
import type { ChainResponse } from '../fixtures/isochrone'
import { resolveMapStyleUrl } from '../mapStyle'
import type { Route, Station, Service } from '../api/scenarios'

const props = defineProps<{
  isochroneData: ChainResponse | null
  loading: boolean
  origin?: { lat: number; lng: number } | null
  routes: Route[]
  stations: Station[]
  services: Service[]
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
let isMapLoaded = false
let routeLayerAdded = false

const MAP_FIT_PADDING = { top: 56, bottom: 112, left: 56, right: 56 }

function fitMapToAllSegments(): void {
  if (!map) return
  map.resize()
  map.fitBounds(ISOCHRONE_BOUNDS_CORNERS, {
    padding: MAP_FIT_PADDING,
    duration: 0,
    maxZoom: 11,
  })
  hasFittedToSegments = true
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

function applyIsochroneData(data: ChainResponse): void {
  if (!map) return
  const existing = map.getSource(ISOCHRONE_SOURCE_ID) as GeoJSONSource | undefined
  if (existing) {
    existing.setData(data)
  } else {
    useIsochroneLayer(map, data, isochroneColors)
  }
  fitMapToIsochrone(data)
}

function maybeAddRouteLayer(): void {
  if (!map || !isMapLoaded || routeLayerAdded) return
  if (props.routes.length === 0) return
  useRouteLayer(map, props.routes, props.stations)
  routeLayerAdded = true
}

watch(
  () => props.isochroneData,
  (data) => {
    if (!data || !isMapLoaded) return
    applyIsochroneData(data)
  },
)

watch(
  () => props.origin,
  (coords) => {
    if (!coords || !isMapLoaded) return
    snapMapToOrigin(coords)
  },
)

watch(
  () => props.routes,
  maybeAddRouteLayer,
)

onMounted(() => {
  if (!mapContainer.value) return

  map = new Map({
    container: mapContainer.value,
    style: resolveMapStyleUrl(),
    center: ISOCHRONE_CENTER,
    zoom: 7,
  })

  map.addControl(new FullscreenControl())

  useOriginMarker(map, toRef(props, 'origin'))

  map.on('load', () => {
    if (!map) return
    isMapLoaded = true

    maybeAddRouteLayer()

    if (props.isochroneData) {
      applyIsochroneData(props.isochroneData)
    } else if (props.origin) {
      snapMapToOrigin(props.origin)
    } else {
      fitMapToAllSegments()
    }
  })

  resizeObserver = new ResizeObserver(() => {
    if (!map || !mapContainer.value) return
    const { clientWidth, clientHeight } = mapContainer.value
    if (clientWidth === 0 || clientHeight === 0) return
    map.resize()
    if (!hasFittedToSegments) {
      fitMapToAllSegments()
    }
  })
  resizeObserver.observe(mapContainer.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
})
</script>

<template>
  <div class="map-frame relative h-full min-h-[70vh] w-full">
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
    <!-- Top-left is the only corner MapLibre leaves free: attribution takes the
         bottom (wrapping to two lines when narrow) and the fullscreen control
         the top-right. Anywhere else the key's second row gets covered. -->
    <aside
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
