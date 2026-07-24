<script setup lang="ts">
import IsochroneForm from '../IsochroneForm.vue'
import MapView from './MapView.vue'
import type { NearMiss, Service, StopCluster } from '../api/authoring/types'
import type { ChainResponse } from '../fixtures/isochrone'
import type { IsochronePayload } from '../composables/useScenarioIsochrone'

// The preview half of a compiled scenario — map, plot form, and what the merge
// did. Shared by the builder (previewing the scenario it just saved) and the
// preview page at /authoring/scenarios/:slug, which show the same thing and
// differ only in the status note above the reports.
const props = defineProps<{
  origin: { lat: number; lng: number } | null
  isochroneData: ChainResponse | null
  loading: boolean
  error: string | null
  nearMisses: NearMiss[]
  realisedClusters: StopCluster[]
  services: Service[]
  statusNote?: string | null
}>()

defineEmits<{
  submit: [payload: IsochronePayload]
  'origin-change': [coords: { lat: number; lng: number } | null]
}>()

// Near-misses and clusters name stops by service_id; the compile result does
// not carry display names, so resolve them against the caller's service list
// rather than have the result carry names twice.
function serviceName(serviceId: string): string {
  return props.services.find((service) => service.id === serviceId)?.name ?? serviceId
}

function formatMeters(total: number): string {
  return `${Math.round(total)} m`
}
</script>

<template>
  <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
    <div class="h-[70vh] overflow-hidden rounded-(--radius-box) border border-border">
      <MapView
        :origin="props.origin"
        :isochrone-data="props.isochroneData"
        :loading="props.loading"
        :routes="[]"
        :stations="[]"
        :services="[]"
      />
    </div>

    <div class="flex flex-col gap-4">
      <IsochroneForm
        :error="props.error"
        :loading="props.loading"
        @submit="$emit('submit', $event)"
        @origin-change="$emit('origin-change', $event)"
      />
      <p
        v-if="props.statusNote"
        class="font-body text-caption text-ink-muted italic"
        role="status"
        data-testid="recompiling-status"
      >
        {{ props.statusNote }}
      </p>

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
