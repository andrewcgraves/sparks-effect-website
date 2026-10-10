<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'
import IsochroneForm from '../IsochroneForm.vue'
import InterchangeReport from './InterchangeReport.vue'
import MapView from './MapView.vue'
import PhoneMapPage from './PhoneMapPage.vue'
import RoutingStatusBanner from './RoutingStatusBanner.vue'
import TimeRemaining from './TimeRemaining.vue'
import { ORIGIN_PICK_CUE } from './placementCues'
import { usePhoneMapTabs, type PhoneMapTab } from './phoneMapTabs'
import { buildTimeRemainingGraph, remainingSecsBySlug } from './timeRemaining'
import { useOriginPick } from '../composables/useOriginPick'
import { useRoutingStatus } from '../composables/useRoutingStatus'
import type { InterchangePair, NearMiss, Service, StopCluster, StopIdentity } from '../api/authoring/types'
import type { Route, Station } from '../api/scenarios'
import type { ChainResponse } from '../fixtures/isochrone'
import type { IsochronePayload } from '../isochroneQuery'

const props = defineProps<{
  origin: { lat: number; lng: number } | null
  isochroneData: ChainResponse | null
  loading: boolean
  loadingMessage?: string
  error: string | null
  nearMisses: NearMiss[]
  realisedClusters: StopCluster[]
  services: Pick<Service, 'id' | 'name'>[]
  mapStations?: Station[]
  mapRoutes?: Route[]
  statusNote?: string | null
  initial?: Partial<IsochronePayload>
  interchangePairs?: InterchangePair[] | null
  interchangeBusy?: boolean
  stopMissing?: (stop: StopIdentity) => boolean
  // The host decides when the page is a phone page: it is the host whose
  // heading, links and cards the phone layout replaces, and which fills the
  // panel's extra tabs through its `phone-<key>` slots.
  phone?: boolean
  title?: string
  phoneTabs?: PhoneMapTab[]
}>()

defineEmits<{
  submit: [payload: IsochronePayload]
  'origin-change': [coords: { lat: number; lng: number } | null]
  join: [nearMiss: NearMiss]
  recompile: []
}>()

const slots = useSlots()
const { pickArmed, onMapClick } = useOriginPick()
const { status: routingStatus, offline: routingOffline } = useRoutingStatus()

const timeRemaining = computed(() =>
  buildTimeRemainingGraph(props.isochroneData?.metadata ?? null, {
    stationName: (slug) => props.mapStations?.find((station) => station.slug === slug)?.name ?? slug,
    serviceName: (id) => props.services.find((service) => service.id === id)?.name ?? id,
    mode: props.isochroneData?.metadata.mode ?? 'walk',
  }),
)

const remainingBySlug = computed(() => remainingSecsBySlug(timeRemaining.value))

const activeStation = ref<{ slug: string; fromMap: boolean } | null>(null)

function highlight(slug: string | null, fromMap: boolean): void {
  activeStation.value = slug ? { slug, fromMap } : null
}

function remainingSecs(slug: string): number | null {
  return remainingBySlug.value(slug)
}

const hasInterchanges = computed(
  () => props.nearMisses.length > 0 || props.realisedClusters.length > 0 || slots.interchanges !== undefined,
)

const { tabs: allPhoneTabs, tab: phoneTab } = usePhoneMapTabs({
  results: () => timeRemaining.value.views.length > 0,
  extra: () => [
    ...(hasInterchanges.value ? [{ key: 'interchanges', label: 'Interchanges' }] : []),
    ...(props.phoneTabs ?? []),
  ],
})
</script>

<template>
  <PhoneMapPage
    v-if="props.phone"
    v-model:tab="phoneTab"
    :title="props.title ?? ''"
    :tabs="allPhoneTabs"
    :pick-armed="pickArmed"
  >
    <template #map>
      <MapView
        label="Splash zone map"
        flush
        :origin="props.origin"
        :isochrone-data="props.isochroneData"
        :loading="props.loading"
        :loading-message="props.loadingMessage"
        :routes="props.mapRoutes ?? []"
        :stations="props.mapStations ?? []"
        :placement-armed="pickArmed"
        :placement-cue="ORIGIN_PICK_CUE"
        :active-station="activeStation?.slug ?? null"
        :remaining-secs="remainingSecs"
        @map-click="onMapClick"
        @station-hover="highlight($event, true)"
      />
    </template>
    <template #panel-plot>
      <RoutingStatusBanner :status="routingStatus" />
      <IsochroneForm
        ref="isochroneForm"
        :error="props.error"
        :loading="props.loading"
        :offline="routingOffline"
        :initial="props.initial"
        @submit="$emit('submit', $event)"
        @origin-change="$emit('origin-change', $event)"
        @pick-armed="pickArmed = $event"
      />
      <slot name="after-form" />
      <p
        v-if="props.statusNote"
        class="font-body text-caption text-ink-muted italic"
        role="status"
        data-testid="recompiling-status"
      >
        {{ props.statusNote }}
      </p>
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
    <template #panel-interchanges>
      <InterchangeReport
        :near-misses="props.nearMisses"
        :realised-clusters="props.realisedClusters"
        :services="props.services"
        :interchange-pairs="props.interchangePairs"
        :interchange-busy="props.interchangeBusy"
        :stop-missing="props.stopMissing"
        @join="$emit('join', $event)"
        @recompile="$emit('recompile')"
      />
      <slot name="interchanges" />
    </template>
    <template
      v-for="tab in props.phoneTabs ?? []"
      :key="tab.key"
      #[`panel-${tab.key}`]
    >
      <slot :name="`phone-${tab.key}`" />
    </template>
  </PhoneMapPage>

  <div
    v-else
    class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]"
  >
    <div class="h-[70vh]">
      <MapView
        label="Splash zone map"
        :origin="props.origin"
        :isochrone-data="props.isochroneData"
        :loading="props.loading"
        :loading-message="props.loadingMessage"
        :routes="props.mapRoutes ?? []"
        :stations="props.mapStations ?? []"
        :placement-armed="pickArmed"
        :placement-cue="ORIGIN_PICK_CUE"
        :active-station="activeStation?.slug ?? null"
        :remaining-secs="remainingSecs"
        @map-click="onMapClick"
        @station-hover="highlight($event, true)"
      />
    </div>

    <div class="flex flex-col gap-4">
      <RoutingStatusBanner :status="routingStatus" />
      <IsochroneForm
        ref="isochroneForm"
        :error="props.error"
        :loading="props.loading"
        :offline="routingOffline"
        :initial="props.initial"
        @submit="$emit('submit', $event)"
        @origin-change="$emit('origin-change', $event)"
        @pick-armed="pickArmed = $event"
      />
      <slot name="after-form" />
      <p
        v-if="props.statusNote"
        class="font-body text-caption text-ink-muted italic"
        role="status"
        data-testid="recompiling-status"
      >
        {{ props.statusNote }}
      </p>

      <TimeRemaining
        v-if="timeRemaining.views.length"
        :views="timeRemaining.views"
        :active-slug="activeStation?.slug ?? null"
        :active-from-map="activeStation?.fromMap ?? false"
        @activate="highlight($event, false)"
      />

      <InterchangeReport
        :near-misses="props.nearMisses"
        :realised-clusters="props.realisedClusters"
        :services="props.services"
        :interchange-pairs="props.interchangePairs"
        :interchange-busy="props.interchangeBusy"
        :stop-missing="props.stopMissing"
        @join="$emit('join', $event)"
        @recompile="$emit('recompile')"
      />

      <slot name="interchanges" />
    </div>
  </div>
</template>
