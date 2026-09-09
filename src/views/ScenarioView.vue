<script setup lang="ts">
import { computed, ref } from 'vue'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from '../components/MapView.vue'
import PrerenderedIsochrones from '../components/PrerenderedIsochrones.vue'
import TimeBetweenStations from '../components/TimeBetweenStations.vue'
import TimeRemaining from '../components/TimeRemaining.vue'
import { segmentStationTimeGroups } from '../components/stationTimes'
import { buildTimeRemainingGraph, shortLineName } from '../components/timeRemaining'
import { ORIGIN_PICK_CUE } from '../components/placementCues'
import { useScenario } from '../composables/useScenario'
import { useScenarioTravelTimes } from '../composables/useScenarioTravelTimes'
import { useIsochrone } from '../composables/useIsochrone'
import { useOriginPick } from '../composables/useOriginPick'
import type { TravelMode } from '../api/authoring'

const props = defineProps<{ slug: string }>()

const origin = ref<{ lat: number; lng: number } | null>(null)
const { pickArmed, onMapClick } = useOriginPick()

const { name, description, routes, stations, services } = useScenario(props.slug)

const {
  segments,
  loading: travelTimesLoading,
  failed: travelTimesFailed,
} = useScenarioTravelTimes(props.slug)

const stationTimeGroups = computed(() =>
  segmentStationTimeGroups(segments.value, stations.value, routes.value),
)
const {
  data: isochroneData,
  loading: isLoading,
  error: fetchError,
  generate,
  show: showIsochrone,
} = useIsochrone(() => stations.value)

const activeStation = ref<{ slug: string; fromMap: boolean } | null>(null)

function highlight(slug: string | null, fromMap: boolean) {
  activeStation.value = slug ? { slug, fromMap } : null
}

function lineOf(id: string): { key: string; label: string } {
  const service = services.value.find((s) => s.id === id)
  const route = service?.route_id
    ? routes.value.find((r) => r.id === service.route_id)
    : undefined
  return route
    ? { key: route.id, label: shortLineName(route.name) }
    : { key: id, label: service?.name ?? id }
}

const timeRemaining = computed(() =>
  buildTimeRemainingGraph(isochroneData.value?.metadata ?? null, {
    stationName: (slug) => stations.value.find((s) => s.slug === slug)?.name ?? slug,
    serviceName: (id) => services.value.find((s) => s.id === id)?.name ?? id,
    line: lineOf,
    mode: isochroneData.value?.metadata.mode ?? 'walk',
  }),
)

const selectedPrerenderedId = ref<string | null>(null)

function onOriginChange(coords: { lat: number; lng: number } | null) {
  origin.value = coords
}

async function handleFormSubmit(payload: { lat: number; lng: number; duration: number; mode: TravelMode }) {
  // Generating replaces what the map is drawing, so the pre-rendered pick that
  // was drawing it is no longer the answer on screen and stops being marked as
  // one. Cleared on submit rather than on success: the moment the question
  // changes, the old highlight is already wrong.
  selectedPrerenderedId.value = null
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
          :active-station="activeStation?.slug ?? null"
          @map-click="onMapClick"
          @station-hover="highlight($event, true)"
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
        
        <PrerenderedIsochrones
          v-model:selected-id="selectedPrerenderedId"
          :slug="props.slug"
          @select="showIsochrone"
        />
        
        <TimeRemaining
          v-if="timeRemaining.views.length"
          :views="timeRemaining.views"
          :active-slug="activeStation?.slug ?? null"
          :active-from-map="activeStation?.fromMap ?? false"
          @activate="highlight($event, false)"
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
      
      <p class="font-body text-caption mt-3 text-ink-muted italic">
        Placeholder — awaiting a field on the scenario API.
      </p>
    </section>
  </main>
</template>
