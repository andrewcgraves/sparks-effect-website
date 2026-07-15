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
    <header class="flex items-center gap-3 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white shadow-sm">
      <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-lg font-bold">S</span>
      <h1 class="text-lg font-semibold tracking-tight">
        Sparks Effect
      </h1>
    </header>
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
