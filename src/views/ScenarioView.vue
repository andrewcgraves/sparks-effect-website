<script setup lang="ts">
import { computed, ref } from 'vue'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from '../components/MapView.vue'
import TimeBetweenStations from '../components/TimeBetweenStations.vue'
import { segmentStationTimeGroups } from '../components/stationTimes'
import { ORIGIN_PICK_CUE } from '../components/placementCues'
import { useScenario } from '../composables/useScenario'
import { useScenarioTravelTimes } from '../composables/useScenarioTravelTimes'
import { useIsochrone } from '../composables/useIsochrone'
import { useOriginPick } from '../composables/useOriginPick'

const props = defineProps<{ slug: string }>()

const origin = ref<{ lat: number; lng: number } | null>(null)
const { pickArmed, onMapClick } = useOriginPick()

const { name, description, routes, stations, services } = useScenario(props.slug)

const {
  segments,
  loading: travelTimesLoading,
  failed: travelTimesFailed,
} = useScenarioTravelTimes(props.slug)

const stationTimeGroups = computed(() => segmentStationTimeGroups(segments.value, stations.value))
const { data: isochroneData, loading: isLoading, error: fetchError, generate } = useIsochrone()

function onOriginChange(coords: { lat: number; lng: number } | null) {
  origin.value = coords
}

async function handleFormSubmit(payload: { lat: number; lng: number; duration: number; mode: 'walk' | 'bike' | 'drive' }) {
  origin.value = { lat: payload.lat, lng: payload.lng }
  await generate({
    lat: payload.lat,
    lng: payload.lng,
    budget_mins: payload.duration,
    mode: payload.mode,
    scenario_slug: props.slug,
  })
}
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <hgroup class="flex max-w-[720px] flex-col gap-2">
      <h1 class="font-display text-display text-ink-true">
        Route: {{ name || 'Sparks Effect' }}
      </h1>
      <!-- Static copy: the scenario API exposes no field for this kicker yet. -->
      <p class="font-body text-micro text-ink-muted italic uppercase">
        Electrified · High-speed rail · Greenfield
      </p>
    </hgroup>

    <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
      <div class="h-[70vh]">
        <MapView
          :origin="origin"
          :isochrone-data="isochroneData"
          :loading="isLoading"
          :routes="routes"
          :stations="stations"
          :services="services"
          :placement-armed="pickArmed"
          :placement-cue="ORIGIN_PICK_CUE"
          @map-click="onMapClick"
        />
      </div>

      <div class="flex flex-col gap-4">
        <IsochroneForm
          ref="isochroneForm"
          :error="fetchError"
          :loading="isLoading"
          @submit="handleFormSubmit"
          @origin-change="onOriginChange"
          @pick-armed="pickArmed = $event"
        />
        <TimeBetweenStations
          v-if="!travelTimesFailed"
          :groups="stationTimeGroups"
          :loading="travelTimesLoading"
        />
      </div>
    </div>

    <section class="mt-16 max-w-[720px]">
      <h2 class="font-display text-h2 text-ink-true">
        Description
      </h2>
      <p class="font-body text-body mt-3 text-ink-muted">
        {{ description || '—' }}
      </p>
    </section>

    <section class="mt-12 max-w-[720px]">
      <h2 class="font-display text-h2 text-ink-true">
        Technology assumptions
      </h2>
      <!-- Awaiting a `technology_assumptions` field on the scenario API. -->
      <p class="font-body text-caption mt-3 text-ink-muted italic">
        Placeholder — awaiting a field on the scenario API.
      </p>
    </section>
  </main>
</template>
