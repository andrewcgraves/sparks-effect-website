<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { trackPageView } from './analytics/index'
import IsochroneForm from './IsochroneForm.vue'
import MapView from './components/MapView.vue'
import { fetchIsochrone } from './api/isochrone'
import type { ChainResponse } from './fixtures/isochrone'

const origin = ref<{ lat: number; lng: number } | null>(null)
const isochroneData = ref<ChainResponse | null>(null)
const isLoading = ref(false)
const fetchError = ref<string | null>(null)

onMounted(() => {
  trackPageView('/')
})

function onOriginChange(coords: { lat: number; lng: number } | null) {
  origin.value = coords
}

async function handleFormSubmit(payload: { lat: number; lng: number; duration: number; mode: 'walk' | 'bike' | 'drive' }) {
  origin.value = { lat: payload.lat, lng: payload.lng }
  isLoading.value = true
  fetchError.value = null
  try {
    isochroneData.value = await fetchIsochrone({
      lat: payload.lat,
      lng: payload.lng,
      budget_mins: payload.duration,
      mode: payload.mode,
      scenario_slug: 'ca-hsr',
    })
  } catch {
    fetchError.value = 'Failed to generate isochrone. Please try again.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <main class="app-shell">
    <h1>Sparks Effect</h1>
    <IsochroneForm
      @submit="handleFormSubmit"
      @origin-change="onOriginChange"
    />
    <p
      v-if="fetchError"
      class="fetch-error"
      role="alert"
      data-testid="fetch-error"
    >
      {{ fetchError }}
    </p>
    <div class="map-shell">
      <MapView
        :origin="origin"
        :isochrone-data="isochroneData"
        :loading="isLoading"
      />
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

.fetch-error {
  margin: 0.5rem 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 0.875rem;
}

.map-shell {
  flex: 1;
  min-height: 70vh;
}
</style>
