<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useIsochroneLayer } from '../composables/useIsochroneLayer'
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
  <div
    ref="mapContainer"
    class="map-container"
  />
</template>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  min-height: 70vh;
}

</style>
