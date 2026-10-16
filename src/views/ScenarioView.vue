<script setup lang="ts">
import { computed, ref } from 'vue'
import IsochroneForm from '../IsochroneForm.vue'
import CopyLinkButton from '../components/CopyLinkButton.vue'
import MapView from '../components/MapView.vue'
import { PLOT_WITHOUT_MAP } from '../components/mapLoad'
import PlotPanel from '../components/PlotPanel.vue'
import PrerenderedIsochrones from '../components/PrerenderedIsochrones.vue'
import RoutingStatusBanner from '../components/RoutingStatusBanner.vue'
import StationsCard from '../components/StationsCard.vue'
import TimeRemaining from '../components/TimeRemaining.vue'
import { readPlot, stationLines, stationNames } from '../components/stationsCard'
import { buildTimeRemainingGraph, lineByRoute, remainingSecsBySlug } from '../components/timeRemaining'
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
import type { PrerenderedIsochrone } from '../api/prerenderedIsochrones'
import { TRAVEL_MODES, type TravelMode } from '../api/authoring/types'
import LoadingRegion from '../components/LoadingRegion.vue'
import SkeletonShape from '../components/SkeletonShape.vue'
import PhoneMapPage from '../components/PhoneMapPage.vue'
import { usePhoneMapTabs } from '../components/phoneMapTabs'
import { useIsPhone } from '../composables/useIsPhone'
import { UNNAMED_LINE, UNNAMED_STATION } from '../copy/names'

const props = defineProps<{ slug: string }>()

const origin = ref<{ lat: number; lng: number } | null>(null)
const { pickArmed, onMapClick, form: isochroneForm } = useOriginPick()
const { status: routingStatus, offline } = useRoutingStatus()
const hasExamples = ref<boolean | null>(null)

const { name, subtext, description, routes, stations, services, loading: scenarioLoading } = useScenario(props.slug)

usePageTitle(() => name.value)

const {
  segments,
  loading: travelTimesLoading,
  failed: travelTimesFailed,
} = useScenarioTravelTimes(props.slug)

const stationName = computed(() => stationNames(stations.value))
const lines = computed(() => stationLines(segments.value, routes.value, stationName.value))
const {
  data: isochroneData,
  loading: isLoading,
  error: fetchError,
  progress: isochroneProgress,
  generate,
  show: showIsochrone,
} = useIsochrone(() => stations.value, { offline: () => offline.value })

const activeStation = ref<{ slug: string; fromMap: boolean } | null>(null)

function highlight(slug: string | null, fromMap: boolean) {
  activeStation.value = slug ? { slug, fromMap } : null
}

const timeRemaining = computed(() =>
  buildTimeRemainingGraph(isochroneData.value?.metadata ?? null, {
    stationName: (slug) => stations.value.find((s) => s.slug === slug)?.name ?? UNNAMED_STATION,
    serviceName: (id) => services.value.find((s) => s.id === id)?.name ?? UNNAMED_LINE,
    line: lineByRoute(services.value, routes.value),
    mode: isochroneData.value?.metadata.mode ?? 'walk',
  }),
)

const remainingBySlug = computed(() => remainingSecsBySlug(timeRemaining.value))

const plotReading = computed(() => readPlot(isochroneData.value?.metadata ?? null, timeRemaining.value))

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

function onPrerenderedSelect(entry: PrerenderedIsochrone) {
  showIsochrone(entry.result)
  void forgetIsochrone()
  // The form becomes the saved splash zone's question, so the pin moves to its
  // starting point and Plot your own can adjust it from there.
  const mode = TRAVEL_MODES.find((m): m is TravelMode => m === entry.mode)
  if (!mode) return
  isochroneForm.value?.fill({ lat: entry.lat, lng: entry.lng, duration: entry.budget_mins, mode })
}

const isPhone = useIsPhone()

const { tabs: phoneTabs, tab: phoneTab } = usePhoneMapTabs({
  plot: () => isochroneData.value,
  // One Stations tab holds the timetable before a plot and the answer after it.
  results: () => !travelTimesFailed.value || timeRemaining.value.views.length > 0,
  resultsLabel: 'Stations',
  extra: () => [
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
        <PlotPanel
          :has-saved="hasExamples"
          :offline="offline"
        >
          <template #plot>
            <IsochroneForm
              ref="isochroneForm"
              :error="fetchError"
              :loading="isLoading"
              :offline="offline"
              :initial="linkedIsochrone"
              :framed="false"
              @submit="submitIsochrone"
              @origin-change="onOriginChange"
              @pick-armed="pickArmed = $event"
            />
          </template>
          <template #saved>
            <PrerenderedIsochrones
              v-model:selected-id="selectedPrerenderedId"
              :slug="props.slug"
              @select="onPrerenderedSelect"
              @available="hasExamples = $event"
            />
          </template>
        </PlotPanel>
        <CopyLinkButton v-if="shareable" />
      </template>
      <template #panel-results>
        <StationsCard
          v-if="!travelTimesFailed"
          :lines="lines"
          :name="stationName"
          :plot="plotReading"
          :loading="travelTimesLoading"
          :active-slug="activeStation?.slug ?? null"
          :active-from-map="activeStation?.fromMap ?? false"
          @activate="highlight($event, false)"
        />
        <!-- With no run times there are no lines to read a plot along, so the
             plot falls back to the time-remaining graph rather than vanishing. -->
        <TimeRemaining
          v-else-if="timeRemaining.views.length"
          :views="timeRemaining.views"
          :active-slug="activeStation?.slug ?? null"
          :active-from-map="activeStation?.fromMap ?? false"
          @activate="highlight($event, false)"
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
        <PlotPanel
          :has-saved="hasExamples"
          :offline="offline"
        >
          <template #plot>
            <IsochroneForm
              ref="isochroneForm"
              :error="fetchError"
              :loading="isLoading"
              :offline="offline"
              :initial="linkedIsochrone"
              :framed="false"
              @submit="submitIsochrone"
              @origin-change="onOriginChange"
              @pick-armed="pickArmed = $event"
            />
          </template>
          <template #saved>
            <PrerenderedIsochrones
              v-model:selected-id="selectedPrerenderedId"
              :slug="props.slug"
              @select="onPrerenderedSelect"
              @available="hasExamples = $event"
            />
          </template>
        </PlotPanel>
        <CopyLinkButton v-if="shareable" />
        <StationsCard
          v-if="!travelTimesFailed"
          :lines="lines"
          :name="stationName"
          :plot="plotReading"
          :loading="travelTimesLoading"
          :active-slug="activeStation?.slug ?? null"
          :active-from-map="activeStation?.fromMap ?? false"
          @activate="highlight($event, false)"
        />
        <!-- With no run times there are no lines to read a plot along, so the
             plot falls back to the time-remaining graph rather than vanishing. -->
        <TimeRemaining
          v-else-if="timeRemaining.views.length"
          :views="timeRemaining.views"
          :active-slug="activeStation?.slug ?? null"
          :active-from-map="activeStation?.fromMap ?? false"
          @activate="highlight($event, false)"
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
