<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import { Map } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ISOCHRONE_SOURCE_ID, ISOCHRONE_LEGEND, useIsochroneLayer } from '../composables/useIsochroneLayer'
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

const isFullscreen = ref(false)
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
    useIsochroneLayer(map, data)
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

async function toggleFullscreen(): Promise<void> {
  isFullscreen.value = !isFullscreen.value
  await nextTick()
  map?.resize()
}

onMounted(() => {
  if (!mapContainer.value) return

  map = new Map({
    container: mapContainer.value,
    style: resolveMapStyleUrl(),
    center: ISOCHRONE_CENTER,
    zoom: 7,
  })

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
  <div
    data-testid="map-frame"
    :data-fullscreen="isFullscreen"
    :class="isFullscreen ? 'fixed inset-0 z-[1000] w-screen h-svh bg-white' : 'relative w-full h-full min-h-[70vh]'"
  >
    <div
      ref="mapContainer"
      class="w-full h-full min-h-[70vh]"
    />
    <button
      type="button"
      class="absolute top-3 right-3 z-[3] px-[0.9rem] py-[0.45rem] border border-border rounded-full bg-white/92 text-ink font-body text-[0.8125rem] font-semibold cursor-pointer shadow-[0_1px_4px_rgb(0_0_0/20%)] transition-colors ease-[var(--ease-smooth)] hover:border-apricot hover:bg-white"
      data-testid="map-fullscreen-toggle"
      :aria-pressed="isFullscreen"
      :aria-label="isFullscreen ? 'Collapse map' : 'Expand map to fullscreen'"
      @click="toggleFullscreen"
    >
      {{ isFullscreen ? 'Close' : 'Expand' }}
    </button>
    <div
      v-if="loading"
      class="absolute inset-0 z-[2] flex items-center justify-center gap-2.5 bg-white/65 font-body text-ink pointer-events-none"
      data-testid="map-loading"
      aria-live="polite"
      aria-label="Generating isochrone"
    >
      <span class="inline-block w-5 h-5 border-[3px] border-[#ccc] border-t-coral rounded-full animate-spin" />
      <span>Generating isochrone…</span>
    </div>
    <aside
      class="absolute right-3 bottom-3 z-[1] m-0 px-3 py-2.5 border border-border rounded-lg bg-white/92 shadow font-body text-sm"
      aria-label="Isochrone color key"
    >
      <p class="m-0 mb-1.5 font-display font-bold text-ink-true">
        Isochrone key
      </p>
      <ul class="m-0 p-0 list-none space-y-1">
        <li
          v-for="entry in ISOCHRONE_LEGEND"
          :key="entry.source"
          class="flex items-center gap-2"
        >
          <span
            class="inline-block w-3.5 h-3.5 rounded-[3px] opacity-85 shrink-0"
            :style="{ backgroundColor: entry.color }"
          />
          <span>{{ entry.label }}</span>
        </li>
      </ul>
    </aside>
  </div>
</template>
