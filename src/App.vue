<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { trackPageView } from './analytics/index'
import IsochroneForm from './IsochroneForm.vue'
import MapView from './components/MapView.vue'

const origin = ref<{ lat: number; lng: number } | null>(null)

onMounted(() => {
  trackPageView('/')
})

function onFormSubmit(payload: { lat: number; lng: number; duration: number }) {
  origin.value = { lat: payload.lat, lng: payload.lng }
}
</script>

<template>
  <main class="app-shell">
    <h1>Sparks Effect</h1>
    <IsochroneForm @submit="onFormSubmit" />
    <div class="map-shell">
      <MapView :origin="origin" />
    </div>
  </main>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100svh;
  margin: 0;
}

.app-shell h1 {
  margin: 0.75rem 1rem;
}

.map-shell {
  flex: 1;
  min-height: 70vh;
}
</style>
