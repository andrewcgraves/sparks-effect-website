<script setup lang="ts">
import { computed, ref } from 'vue'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from './MapView.vue'
import RoutingStatusBanner from './RoutingStatusBanner.vue'
import TimeRemaining from './TimeRemaining.vue'
import { ORIGIN_PICK_CUE } from './placementCues'
import { buildTimeRemainingGraph, remainingSecsBySlug } from './timeRemaining'
import { useOriginPick } from '../composables/useOriginPick'
import { useRoutingStatus } from '../composables/useRoutingStatus'
import { hasInterchangePair, interchangePairKey, nearMissPair } from '../api/authoring/scenarioInput'
import type { InterchangePair, NearMiss, Service, StopCluster, StopIdentity } from '../api/authoring/types'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'
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
  // Only a scenario's owner can join stops, so only a page that passes its
  // declared pairs gets the button; every other preview just reports.
  interchangePairs?: InterchangePair[] | null
  interchangeBusy?: boolean
  // The graph shown can predate an edit that deleted a line or renamed a stop
  // (a new slug), and a pair naming either is refused or breaks the compile.
  stopMissing?: (stop: StopIdentity) => boolean
}>()

defineEmits<{
  submit: [payload: IsochronePayload]
  'origin-change': [coords: { lat: number; lng: number } | null]
  join: [nearMiss: NearMiss]
  recompile: []
}>()

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

function serviceName(serviceId: string): string {
  return props.services.find((service) => service.id === serviceId)?.name ?? serviceId
}

// A declared pair the graph still calls a near miss was joined after this
// graph compiled — or its recompile failed, or has not run since a reload.
// Joining again would only declare it twice; recompiling is what connects it.
const nearMissRows = computed(() =>
  props.nearMisses.map((nearMiss) => {
    const pair = nearMissPair(nearMiss)
    return {
      nearMiss,
      key: interchangePairKey(pair),
      declared: hasInterchangePair(props.interchangePairs ?? [], pair),
      gone: Boolean(props.stopMissing?.(pair.a) || props.stopMissing?.(pair.b)),
    }
  }),
)

function formatMeters(total: number): string {
  return `${Math.round(total)} m`
}
</script>

<template>
  <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
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

      <section
        v-if="props.nearMisses.length"
        class="rounded-(--radius-box) border border-border bg-surface p-4"
        data-testid="near-miss-list"
      >
        <h2 class="font-display text-h3 text-ink-true">
          Did not connect
        </h2>
        <ul class="mt-3 flex flex-col gap-2">
          <li
            v-for="row in nearMissRows"
            :key="row.key"
            class="font-body text-caption flex flex-col items-start gap-2 text-ink"
            data-testid="near-miss-row"
          >
            <span>
              {{ row.nearMiss.a.name }} ({{ serviceName(row.nearMiss.a.service_id) }}) and
              {{ row.nearMiss.b.name }} ({{ serviceName(row.nearMiss.b.service_id) }})
              are {{ formatMeters(row.nearMiss.distance_m) }} apart and did not connect
            </span>
            <template v-if="props.interchangePairs && row.declared">
              <span
                class="text-ink-muted italic"
                data-testid="near-miss-declared"
              >Declared — not in the compiled network yet</span>
              <button
                type="button"
                :class="SECONDARY_BUTTON_CLASS"
                :disabled="props.interchangeBusy"
                :aria-label="`Recompile so ${row.nearMiss.a.name} and ${row.nearMiss.b.name} connect`"
                data-testid="recompile-interchange"
                @click="$emit('recompile')"
              >
                Recompile
              </button>
            </template>
            <template v-else-if="props.interchangePairs">
              <span
                v-if="row.gone"
                class="text-ink-muted italic"
                data-testid="near-miss-gone"
              >A stop is no longer in this network</span>
              <button
                type="button"
                :class="SECONDARY_BUTTON_CLASS"
                :disabled="props.interchangeBusy || row.gone"
                :title="row.gone ? 'Stop no longer in this network' : undefined"
                :aria-label="`Join ${row.nearMiss.a.name} and ${row.nearMiss.b.name} as an interchange`"
                data-testid="join-interchange"
                @click="$emit('join', row.nearMiss)"
              >
                Join as interchange
              </button>
            </template>
          </li>
        </ul>
      </section>

      <section
        v-if="props.realisedClusters.length"
        class="rounded-(--radius-box) border border-border bg-surface p-4"
        data-testid="realised-clusters"
      >
        <h2 class="font-display text-h3 text-ink-true">
          Realised interchanges
        </h2>
        <ul class="mt-3 flex flex-col gap-2">
          <li
            v-for="cluster in props.realisedClusters"
            :key="cluster.key"
            class="font-body text-caption text-ink"
            data-testid="realised-cluster-row"
          >
            {{ cluster.names.join(', ') }}
          </li>
        </ul>
      </section>

      <slot name="interchanges" />
    </div>
  </div>
</template>
