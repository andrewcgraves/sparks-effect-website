<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ISOCHRONE_LEGEND, useIsochroneLayer } from '../composables/useIsochroneLayer'
import { staticIsochroneResponse, ISOCHRONE_BOUNDS } from '../fixtures/isochrone'
import { resolveMapStyleUrl } from '../mapStyle'

const mapContainer = ref<HTMLElement | null>(null)
let map: Map | null = null

onMounted(() => {
  if (!mapContainer.value) return

  map = new Map({
    container: mapContainer.value,
    style: resolveMapStyleUrl(),
    center: [-121.97, 37.39],
    zoom: 8,
  })

  map.on('load', () => {
    if (!map) return
    useIsochroneLayer(map, staticIsochroneResponse)
    map.fitBounds(ISOCHRONE_BOUNDS, { padding: 40 })
  })
})

onUnmounted(() => {
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
