<script setup lang="ts">
import { computed, ref } from 'vue'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from './MapView.vue'
import TimeRemaining from './TimeRemaining.vue'
import { ORIGIN_PICK_CUE } from './placementCues'
import { buildTimeRemainingGraph, remainingSecsBySlug } from './timeRemaining'
import { useOriginPick } from '../composables/useOriginPick'
import type { NearMiss, Service, StopCluster } from '../api/authoring/types'
import type { Route, Station } from '../api/scenarios'
import type { ChainResponse } from '../fixtures/isochrone'
import type { IsochronePayload } from '../isochroneQuery'

const props = defineProps<{
  origin: { lat: number; lng: number } | null
  isochroneData: ChainResponse | null
  loading: boolean
  error: string | null
  nearMisses: NearMiss[]
  realisedClusters: StopCluster[]
  services: Pick<Service, 'id' | 'name'>[]
  mapStations?: Station[]
  mapRoutes?: Route[]
  statusNote?: string | null
  initial?: Partial<IsochronePayload>
}>()

defineEmits<{
  submit: [payload: IsochronePayload]
  'origin-change': [coords: { lat: number; lng: number } | null]
}>()

const { pickArmed, onMapClick } = useOriginPick()

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

function formatMeters(total: number): string {
  return `${Math.round(total)} m`
}
</script>

<template>
  <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
    <div class="h-[70vh]">
      <MapView
        :origin="props.origin"
        :isochrone-data="props.isochroneData"
        :loading="props.loading"
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
      <IsochroneForm
        ref="isochroneForm"
        :error="props.error"
        :loading="props.loading"
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
            v-for="(nearMiss, index) in props.nearMisses"
            :key="index"
            class="font-body text-caption text-ink"
            data-testid="near-miss-row"
          >
            {{ nearMiss.a.name }} ({{ serviceName(nearMiss.a.service_id) }}) and
            {{ nearMiss.b.name }} ({{ serviceName(nearMiss.b.service_id) }})
            are {{ formatMeters(nearMiss.distance_m) }} apart and did not connect
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
    </div>
  </div>
</template>
