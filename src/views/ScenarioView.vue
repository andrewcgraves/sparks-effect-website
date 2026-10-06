<script setup lang="ts">
import { computed, ref } from 'vue'
import IsochroneForm from '../IsochroneForm.vue'
import CopyLinkButton from '../components/CopyLinkButton.vue'
import MapView from '../components/MapView.vue'
import PrerenderedIsochrones from '../components/PrerenderedIsochrones.vue'
import RoutingStatusBanner from '../components/RoutingStatusBanner.vue'
import TimeBetweenStations from '../components/TimeBetweenStations.vue'
import TimeRemaining from '../components/TimeRemaining.vue'
import { segmentStationTimeGroups } from '../components/stationTimes'
import { buildTimeRemainingGraph, remainingSecsBySlug, shortLineName } from '../components/timeRemaining'
import { ORIGIN_PICK_CUE } from '../components/placementCues'
import { isochroneWaitMessage } from '../api/isochroneFault'
import { useScenario } from '../composables/useScenario'
import { useScenarioTravelTimes } from '../composables/useScenarioTravelTimes'
import { useIsochrone } from '../composables/useIsochrone'
import { useOriginPick } from '../composables/useOriginPick'
import { useRoutingStatus } from '../composables/useRoutingStatus'
import { usePageTitle } from '../composables/usePageTitle'
import AllLinesLink from '../components/AllLinesLink.vue'
import { useIsochroneQuery } from '../composables/useIsochroneQuery'
import type { IsochronePayload } from '../isochroneQuery'
import type { ChainResponse } from '../fixtures/isochrone'
import LoadingRegion from '../components/LoadingRegion.vue'
import SkeletonShape from '../components/SkeletonShape.vue'

const props = defineProps<{ slug: string }>()

const origin = ref<{ lat: number; lng: number } | null>(null)
const { pickArmed, onMapClick } = useOriginPick()
const { status: routingStatus, offline } = useRoutingStatus()
const hasExamples = ref<boolean | null>(null)

const { name, description, routes, stations, services, loading: scenarioLoading } = useScenario(props.slug)

usePageTitle(() => name.value)

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
  progress: isochroneProgress,
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

const remainingBySlug = computed(() => remainingSecsBySlug(timeRemaining.value))

function remainingSecs(slug: string): number | null {
  return remainingBySlug.value(slug)
}

const selectedPrerenderedId = ref<string | null>(null)

function onOriginChange(coords: { lat: number; lng: number } | null) {
  origin.value = coords
}

async function handleFormSubmit(payload: IsochronePayload) {
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

const { initial: linkedIsochrone, submit: submitIsochrone, forget: forgetIsochrone, shareable } = useIsochroneQuery({
  plot: handleFormSubmit,
  plotted: () => isochroneData.value !== null && fetchError.value === null,
  // The stations are what the range check measures against; plotting a link
  // before they arrive would skip it and spend a routing job on a refusal.
  ready: () => stations.value.length > 0,
})

function onPrerenderedSelect(result: ChainResponse) {
  showIsochrone(result)
  void forgetIsochrone()
}
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <AllLinesLink />
    <LoadingRegion
      v-if="scenarioLoading"
      label="Loading network"
      class="mt-8 max-w-[720px] font-display text-display"
      data-testid="scenario-title-loading"
    >
      <SkeletonShape class="w-3/4 max-w-[480px]" />
    </LoadingRegion>
    <h1
      v-else
      class="mt-8 max-w-[720px] font-display text-display text-ink-true"
    >
      {{ name || 'Sparks Effect' }}
    </h1>

    <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
      <div class="h-[70vh]">
        <MapView
          :origin="origin"
          :isochrone-data="isochroneData"
          :loading="isLoading"
          :loading-message="isochroneWaitMessage(isochroneProgress)"
          :routes="routes"
          :stations="stations"
          :placement-armed="pickArmed"
          :placement-cue="ORIGIN_PICK_CUE"
          :active-station="activeStation?.slug ?? null"
          :remaining-secs="remainingSecs"
          @map-click="onMapClick"
          @station-hover="highlight($event, true)"
        />
      </div>

      <div class="flex flex-col gap-4">
        <RoutingStatusBanner
          :status="routingStatus"
          :has-examples="hasExamples"
        />
        <!-- With live routing offline the saved examples are the page's answer,
             so they come ahead of a form that cannot plot — in the DOM, not
             just on screen, so keyboard and screen-reader order agree. -->
        <PrerenderedIsochrones
          v-if="offline"
          v-model:selected-id="selectedPrerenderedId"
          :slug="props.slug"
          @select="onPrerenderedSelect"
          @available="hasExamples = $event"
        />
        <IsochroneForm
          ref="isochroneForm"
          :error="fetchError"
          :loading="isLoading"
          :offline="offline"
          :initial="linkedIsochrone"
          @submit="submitIsochrone"
          @origin-change="onOriginChange"
          @pick-armed="pickArmed = $event"
        />
        <CopyLinkButton v-if="shareable" />
        <PrerenderedIsochrones
          v-if="!offline"
          v-model:selected-id="selectedPrerenderedId"
          :slug="props.slug"
          @select="onPrerenderedSelect"
          @available="hasExamples = $event"
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

    <section
      v-if="description.trim()"
      class="mt-16 max-w-[720px]"
    >
      <h2 class="font-display text-h2 text-ink-true">
        Description
      </h2>
      <p class="font-body text-body mt-3 text-ink-muted">
        {{ description }}
      </p>
    </section>
  </main>
</template>
