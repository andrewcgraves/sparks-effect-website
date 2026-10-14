<script setup lang="ts">
import { computed, ref } from 'vue'
import IsochroneForm from '../IsochroneForm.vue'
import CopyLinkButton from '../components/CopyLinkButton.vue'
import MapView from '../components/MapView.vue'
import { PLOT_WITHOUT_MAP } from '../components/mapLoad'
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
import PhoneMapPage from '../components/PhoneMapPage.vue'
import { usePhoneMapTabs } from '../components/phoneMapTabs'
import { useIsPhone } from '../composables/useIsPhone'
import { UNNAMED_LINE, UNNAMED_STATION } from '../copy/names'

const props = defineProps<{ slug: string }>()

const origin = ref<{ lat: number; lng: number } | null>(null)
const { pickArmed, onMapClick } = useOriginPick()
const { status: routingStatus, offline } = useRoutingStatus()
const hasExamples = ref<boolean | null>(null)

const { name, subtext, description, routes, stations, services, loading: scenarioLoading } = useScenario(props.slug)

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
  // Lines that share a route share a tab. A curated network names the route
  // what riders call the line ("Brightline West — Palmdale to Las Vegas"), so
  // its short name is the tab's line name; a line on no route uses its own.
  const service = services.value.find((s) => s.id === id)
  const route = service?.route_id
    ? routes.value.find((r) => r.id === service.route_id)
    : undefined
  return route
    ? { key: route.id, label: shortLineName(route.name) }
    : { key: id, label: service?.name ?? UNNAMED_LINE }
}

const timeRemaining = computed(() =>
  buildTimeRemainingGraph(isochroneData.value?.metadata ?? null, {
    stationName: (slug) => stations.value.find((s) => s.slug === slug)?.name ?? UNNAMED_STATION,
    serviceName: (id) => services.value.find((s) => s.id === id)?.name ?? UNNAMED_LINE,
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
  // Plotting replaces what the map is drawing, so the saved splash zone that
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

const isPhone = useIsPhone()

const { tabs: phoneTabs, tab: phoneTab } = usePhoneMapTabs({
  plot: () => isochroneData.value,
  results: () => timeRemaining.value.views.length > 0,
  extra: () => [
    ...(travelTimesFailed.value ? [] : [{ key: 'stations', label: 'Stations' }]),
    ...(subtext.value.trim() || description.value.trim() ? [{ key: 'about', label: 'About' }] : []),
  ],
})
</script>

<template>
  <main
    v-if="isPhone"
    class="flex-1"
  >
    <PhoneMapPage
      v-model:tab="phoneTab"
      :title="name"
      :tabs="phoneTabs"
      :pick-armed="pickArmed"
    >
      <template #map>
        <MapView
          label="Splash zone map"
          :without-map="PLOT_WITHOUT_MAP"
          flush
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
      </template>
      <template #panel-plot>
        <RoutingStatusBanner
          :status="routingStatus"
          :has-examples="hasExamples"
        />
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
      </template>
      <template #panel-results>
        <TimeRemaining
          v-if="timeRemaining.views.length"
          :views="timeRemaining.views"
          :active-slug="activeStation?.slug ?? null"
          :active-from-map="activeStation?.fromMap ?? false"
          @activate="highlight($event, false)"
        />
      </template>
      <template #panel-stations>
        <TimeBetweenStations
          :groups="stationTimeGroups"
          :loading="travelTimesLoading"
        />
      </template>
      <template #panel-about>
        <p
          v-if="subtext.trim()"
          class="font-body text-micro text-ink-muted italic uppercase"
          data-testid="scenario-subtext"
        >
          {{ subtext }}
        </p>
        <p
          v-if="description.trim()"
          class="font-body text-body whitespace-pre-line text-ink-muted"
          data-testid="scenario-description"
        >
          {{ description }}
        </p>
      </template>
    </PhoneMapPage>
  </main>
  <main
    v-else
    class="flex-1 p-(--page-padding)"
  >
    <AllLinesLink />
    <LoadingRegion
      v-if="scenarioLoading"
      label="Loading network"
      class="mt-8 max-w-[720px] font-display text-display"
      data-testid="scenario-title-loading"
    >
      <SkeletonShape class="w-3/4 max-w-[480px]" />
    </LoadingRegion>
    <hgroup
      v-else
      class="mt-8 flex max-w-[720px] flex-col gap-2"
    >
      <h1 class="font-display text-display text-ink-true">
        {{ name || 'Sparks Effect' }}
      </h1>
      <p
        v-if="subtext.trim()"
        class="font-body text-micro text-ink-muted italic uppercase"
        data-testid="scenario-subtext"
      >
        {{ subtext }}
      </p>
    </hgroup>

    <!-- On wide screens the sidebar spans both rows, so the description sits
         right under the map rather than below the sidebar's last card. The 1fr
         second row soaks up the sidebar's extra height, keeping the first row
         as tall as the map. -->
    <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr] lg:grid-rows-[auto_1fr]">
      <div class="h-[70vh] lg:col-start-1 lg:row-start-1">
        <MapView
          label="Splash zone map"
          :without-map="PLOT_WITHOUT_MAP"
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

      <div class="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <RoutingStatusBanner
          :status="routingStatus"
          :has-examples="hasExamples"
        />
        <!-- With live routing offline the saved splash zones are the page's answer,
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

      <section
        v-if="description.trim()"
        class="mt-12 max-w-[720px] lg:col-start-1 lg:row-start-2 lg:mt-4"
      >
        <h2 class="font-display text-h2 text-ink-true">
          Description
        </h2>
        <p
          class="font-body text-body mt-3 whitespace-pre-line text-ink-muted"
          data-testid="scenario-description"
        >
          {{ description }}
        </p>
      </section>
    </div>
  </main>
</template>
