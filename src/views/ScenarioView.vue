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

const props = defineProps<{ slug: string }>()

const origin = ref<{ lat: number; lng: number } | null>(null)
const { pickArmed, onMapClick } = useOriginPick()

const { name, description, routes, stations, services } = useScenario(props.slug)

const {
  segments,
  loading: travelTimesLoading,
  failed: travelTimesFailed,
} = useScenarioTravelTimes(props.slug)

// The routes come along so each corridor's table can be headed by the line it
// belongs to, rather than the whole scenario being read as one path.
const stationTimeGroups = computed(() =>
  segmentStationTimeGroups(segments.value, stations.value, routes.value),
)
// The stations are handed over as a getter so the range check reads whatever
// has loaded by the time the form is submitted, rather than the empty list this
// page starts with.
const {
  data: isochroneData,
  loading: isLoading,
  error: fetchError,
  generate,
  show: showIsochrone,
} = useIsochrone(() => stations.value)

// The one station highlighted on this page, and which surface raised it. Both
// the map and the Time remaining card feed it and both read it back, so the
// last interaction wins wherever it came from; the card scrolls a row into view
// only when the map is what named it.
const activeStation = ref<{ slug: string; fromMap: boolean } | null>(null)

function highlight(slug: string | null, fromMap: boolean) {
  activeStation.value = slug ? { slug, fromMap } : null
}

// The line a service runs over, so the card is read one railway at a time
// rather than one timetable at a time. A service whose route the API has not
// reported stands as its own line, which is what the card drew before routes
// were on the wire.
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
        <!-- Always beside the form, never instead of it: these are answers the
             scenario already has, and the form is for the question it doesn't.
             A pick lands in the same ref a generated chain does, so the map and
             the Time remaining card below read it without knowing which it is. -->
        <PrerenderedIsochrones
          :slug="props.slug"
          @select="showIsochrone"
        />
        <!-- Above the station times, because it is the answer to what was just
             asked. Only once a plot has actually succeeded: there is nothing to
             draw while the form is being filled in, and a skeleton in its place
             would make the rail jump every time a plot is asked for — so until
             then the station times sit directly under the form as before. -->
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
      <!-- Awaiting a `technology_assumptions` field on the scenario API. -->
      <p class="font-body text-caption mt-3 text-ink-muted italic">
        Placeholder — awaiting a field on the scenario API.
      </p>
    </section>
  </main>
</template>
