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
    class="map-frame"
    :class="{ 'map-frame--fullscreen': isFullscreen }"
  >
    <div
      ref="mapContainer"
      class="map-container"
    />
    <button
      type="button"
      class="map-fullscreen-toggle"
      data-testid="map-fullscreen-toggle"
      :aria-pressed="isFullscreen"
      :aria-label="isFullscreen ? 'Collapse map' : 'Expand map to fullscreen'"
      @click="toggleFullscreen"
    >
      {{ isFullscreen ? 'Close' : 'Expand' }}
    </button>
    <div
      v-if="loading"
      class="map-loading"
      data-testid="map-loading"
      aria-live="polite"
      aria-label="Generating isochrone"
    >
      <span class="map-loading__spinner" />
      <span>Generating isochrone…</span>
    </div>
    <aside
      class="map-legend"
      aria-label="Isochrone color key"
    >
      <p class="map-legend__title">
        Isochrone key
      </p>
      <ul class="map-legend__list">
        <li
          v-for="entry in ISOCHRONE_LEGEND"
          :key="entry.source"
          class="map-legend__item"
        >
          <span
            class="map-legend__swatch"
            :style="{ backgroundColor: entry.color }"
          />
          <span>{{ entry.label }}</span>
        </li>
      </ul>
    </aside>
  </div>
</template>

<style scoped>
.map-frame {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 70vh;
}

.map-frame--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  width: 100vw;
  height: 100svh;
  background: #ffffff;
}

.map-fullscreen-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgb(255 255 255 / 92%);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 4px rgb(0 0 0 / 20%);
  transition: background 0.18s var(--ease-smooth), border-color 0.18s var(--ease-smooth);
}

.map-fullscreen-toggle:hover {
  border-color: var(--color-apricot);
  background: #ffffff;
}

.map-container {
  width: 100%;
  height: 100%;
  min-height: 70vh;
}

.map-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgb(255 255 255 / 65%);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.4;
  color: var(--color-ink);
  pointer-events: none;
}

.map-loading__spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid var(--color-placeholder);
  border-top-color: var(--color-coral);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.map-legend {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 1;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: rgb(255 255 255 / 92%);
  color: var(--color-ink);
  box-shadow: 0 1px 4px rgb(0 0 0 / 20%);
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.35;
}

.map-legend__title {
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--color-ink-true);
}

.map-legend__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.map-legend__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.map-legend__item + .map-legend__item {
  margin-top: 4px;
}

.map-legend__swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  opacity: 0.85;
  flex-shrink: 0;
}
</style>
