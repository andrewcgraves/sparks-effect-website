<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ISOCHRONE_LEGEND, useIsochroneLayer } from '../composables/useIsochroneLayer'
import { ISOCHRONE_BOUNDS_CORNERS, ISOCHRONE_CENTER } from '../fixtures/isochrone'
import { resolveMapStyleUrl } from '../mapStyle'
import { fetchIsochrone, type IsochroneRequest } from '../api/isochrone'

const DEFAULT_REQUEST: IsochroneRequest = {
  lat: 37.3382,
  lng: -121.8863,
  budget_mins: 90,
  mode: 'walk',
  scenario_slug: 'ca-hsr',
}

const mapContainer = ref<HTMLElement | null>(null)
let map: Map | null = null
let resizeObserver: ResizeObserver | null = null
let hasFittedToSegments = false

function fitMapToAllSegments(): void {
  if (!map) return
  map.resize()
  map.fitBounds(ISOCHRONE_BOUNDS_CORNERS, {
    padding: { top: 56, bottom: 112, left: 56, right: 56 },
    duration: 0,
    maxZoom: 11,
  })
  hasFittedToSegments = true
}

onMounted(() => {
  if (!mapContainer.value) return

  map = new Map({
    container: mapContainer.value,
    style: resolveMapStyleUrl(),
    center: ISOCHRONE_CENTER,
    zoom: 7,
  })

  map.on('load', async () => {
    if (!map) return
    try {
      const data = await fetchIsochrone(DEFAULT_REQUEST)
      useIsochroneLayer(map, data)
    } catch {
      // leave the map empty rather than rendering stale fixture data
    }
    fitMapToAllSegments()
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
  <div class="map-frame">
    <div
      ref="mapContainer"
      class="map-container"
    />
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

.map-container {
  width: 100%;
  height: 100%;
  min-height: 70vh;
}

.map-legend {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 1;
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgb(255 255 255 / 92%);
  color: #1a1a1a;
  box-shadow: 0 1px 4px rgb(0 0 0 / 20%);
  font: 13px/1.35 system-ui, 'Segoe UI', Roboto, sans-serif;
}

.map-legend__title {
  margin: 0 0 6px;
  font-weight: 600;
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
