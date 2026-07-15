<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { trackPageView } from './analytics/index'
import IsochroneForm from './IsochroneForm.vue'
import MapView from './components/MapView.vue'
import { fetchIsochrone } from './api/isochrone'
import { useScenario } from './composables/useScenario'
import type { ChainResponse } from './fixtures/isochrone'
import { DEFAULT_SCENARIO_SLUG } from './constants'

const origin = ref<{ lat: number; lng: number } | null>(null)
const isochroneData = ref<ChainResponse | null>(null)
const isLoading = ref(false)
const fetchError = ref<string | null>(null)

const { routes, stations, services } = useScenario(DEFAULT_SCENARIO_SLUG)

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
      scenario_slug: DEFAULT_SCENARIO_SLUG,
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
        :routes="routes"
        :stations="stations"
        :services="services"
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
  background: #ffffff;
}

.app-shell h1 {
  margin: clamp(1rem, 4vw, 2rem) var(--page-gutter) 0.5rem;
}

.fetch-error {
  margin: 0.5rem var(--page-gutter);
  padding: 0.65rem 0.9rem;
  border: 1px solid #f0c8c4;
  border-left: 3px solid var(--color-coral);
  border-radius: 8px;
  background: #fdf1f0;
  color: #a3352b;
  font-family: var(--font-body);
  font-size: 0.875rem;
  line-height: 1.5;
}

.map-shell {
  flex: 1;
  min-height: 70vh;
}
</style>
