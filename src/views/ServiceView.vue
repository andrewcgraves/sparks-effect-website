<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from '../components/MapView.vue'
import SpeedGraph from '../components/SpeedGraph.vue'
import { fetchIsochrone } from '../api/isochrone'
import { useScenario } from '../composables/useScenario'
import { trackPageView } from '../analytics/index'
import type { ChainResponse } from '../fixtures/isochrone'

const props = defineProps<{ slug: string }>()

const route = useRoute()

const origin = ref<{ lat: number; lng: number } | null>(null)
const isochroneData = ref<ChainResponse | null>(null)
const isLoading = ref(false)
const fetchError = ref<string | null>(null)

const { name, description, routes, stations, services } = useScenario(props.slug)

const heading = computed(() => name.value || 'Transit service')
const leadDescription = computed(
  () => description.value || 'Explore how far you can travel across this transit service.',
)

onMounted(() => {
  trackPageView(route.path)
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
      scenario_slug: props.slug,
    })
  } catch {
    fetchError.value = 'Failed to generate isochrone. Please try again.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="service-view">
    <header class="service-view__header">
      <h1>{{ heading }}</h1>
      <p class="t-lead service-view__description">
        {{ leadDescription }}
      </p>
    </header>

    <section class="service-view__workspace">
      <div class="service-view__map">
        <MapView
          :origin="origin"
          :isochrone-data="isochroneData"
          :loading="isLoading"
          :routes="routes"
          :stations="stations"
          :services="services"
        />
      </div>
      <div class="service-view__form">
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
      </div>
    </section>

    <SpeedGraph class="service-view__speed-graph" />

    <section class="service-view__section">
      <h2>About this service</h2>
      <p>{{ leadDescription }}</p>
    </section>

    <section class="service-view__section">
      <h2>Technology assumptions</h2>
      <ul
        v-if="services.length"
        class="service-view__assumptions"
        data-testid="technology-assumptions"
      >
        <li
          v-for="service in services"
          :key="service.id"
        >
          <strong>{{ service.vehicle_type.name }}</strong>
          — top speed {{ service.vehicle_type.max_speed_kmh }} km/h
          ({{ service.vehicle_type.propulsion }})
        </li>
      </ul>
      <p
        v-else
        data-testid="technology-assumptions"
      >
        Rolling-stock assumptions will be listed here once service data loads.
      </p>
      <p class="t-caption">
        Route-level assumptions such as speed limits are TBD.
      </p>
    </section>
  </div>
</template>

<style scoped>
.service-view {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(1.5rem, 4vw, 2.5rem);
  padding: clamp(1.5rem, 4vw, 2.5rem) var(--page-gutter) 3rem;
}

.service-view__header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 720px;
}

.service-view__description {
  margin: 0;
}

.service-view__workspace {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: clamp(1rem, 3vw, 2rem);
  align-items: start;
}

.service-view__map {
  min-height: 70vh;
  border-radius: 12px;
  overflow: hidden;
}

.service-view__form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.service-view__section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 720px;
}

.service-view__section h2 {
  margin: 0;
}

.service-view__section p {
  margin: 0;
}

.service-view__assumptions {
  margin: 0;
  padding-left: 1.25rem;
  font-family: var(--font-body);
  color: var(--color-ink-muted);
  line-height: 1.7;
}

.service-view__assumptions strong {
  color: var(--color-ink);
}

.fetch-error {
  margin: 0;
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

@media (max-width: 900px) {
  .service-view__workspace {
    grid-template-columns: 1fr;
  }

  .service-view__map {
    min-height: 55vh;
  }
}
</style>
