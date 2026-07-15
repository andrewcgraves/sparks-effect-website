<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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

const { name, description, routes, stations, services, error: scenarioError } = useScenario(props.slug)

const heading = computed(() => name.value || 'Transit service')
const leadDescription = computed(
  () => description.value || 'Explore how far you can travel across this transit service.',
)

watch(
  heading,
  (value) => {
    document.title = `${value} — Sparks Effect`
  },
  { immediate: true },
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
  <div class="grid grid-cols-1 gap-[clamp(1.5rem,4vw,2.5rem)] pt-[clamp(1.5rem,4vw,2.5rem)] px-[var(--page-gutter)] pb-12">
    <header class="flex flex-col gap-2 max-w-[720px]">
      <h1>{{ heading }}</h1>
      <p class="t-lead m-0">
        {{ leadDescription }}
      </p>
      <p
        v-if="scenarioError"
        class="m-0 px-3.5 py-2.5 border border-[#f0c8c4] border-l-[3px] border-l-coral rounded-lg bg-[#fdf1f0] text-[#a3352b] font-body text-sm leading-normal max-w-[720px]"
        role="alert"
        data-testid="scenario-error"
      >
        {{ scenarioError }}
      </p>
    </header>

    <section class="grid grid-cols-1 min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-[clamp(1rem,3vw,2rem)] items-start">
      <div class="min-h-[70vh] max-[899px]:min-h-[55vh] rounded-xl overflow-hidden">
        <MapView
          :origin="origin"
          :isochrone-data="isochroneData"
          :loading="isLoading"
          :routes="routes"
          :stations="stations"
          :services="services"
        />
      </div>
      <div class="flex flex-col gap-3">
        <IsochroneForm
          @submit="handleFormSubmit"
          @origin-change="onOriginChange"
        />
        <p
          v-if="fetchError"
          class="m-0 px-3.5 py-2.5 border border-[#f0c8c4] border-l-[3px] border-l-coral rounded-lg bg-[#fdf1f0] text-[#a3352b] font-body text-sm leading-normal"
          role="alert"
          data-testid="fetch-error"
        >
          {{ fetchError }}
        </p>
        <SpeedGraph />
      </div>
    </section>

    <section class="flex flex-col gap-2 max-w-[720px]">
      <h2 class="m-0">
        About this service
      </h2>
      <p class="m-0">
        {{ leadDescription }}
      </p>
    </section>

    <section class="flex flex-col gap-2 max-w-[720px]">
      <h2 class="m-0">
        Technology assumptions
      </h2>
      <ul
        v-if="services.length"
        class="m-0 pl-5 font-body text-ink-muted leading-7 [&_strong]:text-ink"
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
        {{ scenarioError ? 'Technology assumptions are unavailable for this service.' : 'Rolling-stock assumptions will be listed here once service data loads.' }}
      </p>
      <p class="t-caption">
        Route-level assumptions such as speed limits are TBD.
      </p>
    </section>
  </div>
</template>
