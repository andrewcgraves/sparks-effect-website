<script setup lang="ts">
import { computed, watch } from 'vue'
import { compileService, fetchService, fetchServiceGraph, fetchServiceIsochrone } from '../api/authoring/services'
import type { Service } from '../api/authoring/types'
import { useOwnedDetail } from '../composables/useOwnedDetail'
import { useAuthoredGraph } from '../composables/useAuthoredGraph'
import { usePageTitle } from '../composables/usePageTitle'
import ScenarioPreviewPanel from '../components/ScenarioPreviewPanel.vue'
import PublicationControl from '../components/PublicationControl.vue'
import TimeBetweenStations from '../components/TimeBetweenStations.vue'
import { graphStationTimeGroups } from '../components/stationTimes'
import { ACTION_LINK_CLASS } from '../components/linkStyles'
import BreadcrumbTrail from '../components/BreadcrumbTrail.vue'
import { AUTHORING_CRUMB } from '../components/crumbs'

const props = defineProps<{ slug: string }>()

const { item: service, loading, notFound, error } = useOwnedDetail<Service>(fetchService, props.slug)

usePageTitle(() => service.value?.name)

const stops = computed(() => [...(service.value?.stops ?? [])].sort((a, b) => a.seq - b.seq))

const {
  compiling,
  compileError,
  graph,
  graphFailed,
  loadGraph,
  triggerCompile,
  origin,
  isochroneData,
  isochroneError,
  isochroneFormLoading,
  nearMisses,
  realisedClusters,
  mapStations,
  mapRoutes,
  onOriginChange,
  handleIsochroneSubmit,
} = useAuthoredGraph(() => props.slug, {
  compile: compileService,
  fetchGraph: fetchServiceGraph,
  isochrone: fetchServiceIsochrone,
})

const services = computed(() => (service.value ? [service.value] : []))

const stationTimeGroups = computed(() => graphStationTimeGroups(graph.value, services.value))

const stationTimesFailed = computed(() => Boolean(graphFailed.value || (compileError.value && !graph.value)))

// Publishing compiles through the page's own compile, so the graph it pins is
// the one this page then draws, and a compile fault is reported where every
// other one here is.
async function recompile(slug: string): Promise<boolean> {
  await triggerCompile(slug)
  return !compileError.value
}

watch(service, (loaded) => {
  if (loaded) void loadGraph(loaded.slug)
}, { immediate: true })
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <BreadcrumbTrail :items="[AUTHORING_CRUMB, { label: service?.name ?? 'Service' }]" />

    <p
      v-if="loading"
      class="font-body text-body mt-8 text-ink-muted"
    >
      Loading service…
    </p>

    <template v-else-if="notFound">
      <h1 class="font-display text-display mt-8 text-ink-true">
        Service not found
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        data-testid="service-not-found"
      >
        No service of yours matches "{{ props.slug }}".
      </p>
    </template>

    <template v-else-if="error">
      <h1 class="font-display text-display mt-8 text-ink-true">
        Something went wrong
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        role="alert"
        data-testid="service-error"
      >
        Failed to load this service. Please try again.
      </p>
    </template>

    <template v-else-if="service">
      <div class="mt-8 flex items-start justify-between gap-4">
        <hgroup class="flex flex-col gap-2">
          <h1 class="font-display text-display text-ink-true">
            {{ service.name }}
          </h1>
          <p
            v-if="service.subtext"
            class="font-body text-micro text-ink-muted italic uppercase"
            data-testid="service-subtext"
          >
            {{ service.subtext }}
          </p>
          <p class="font-body text-micro text-ink-muted uppercase">
            {{ service.slug }}
          </p>
        </hgroup>
        <router-link
          :to="`/authoring/services/${service.slug}/edit`"
          :class="ACTION_LINK_CLASS"
          data-testid="edit-service"
        >
          Edit
        </router-link>
      </div>
      <p
        v-if="service.description"
        class="font-body text-body mt-3 max-w-[720px] whitespace-pre-line text-ink"
        data-testid="service-description"
      >
        {{ service.description }}
      </p>

      <PublicationControl
        :slug="service.slug"
        :updated-at="service.updated_at"
        :compiling="compiling"
        :recompile="recompile"
      />

      
      <p
        v-if="compiling && !graph"
        class="font-body text-caption mt-8 text-ink-muted italic"
        data-testid="compiling-status"
      >
        Compiling this service…
      </p>
      <p
        v-else-if="graphFailed"
        class="font-body text-caption mt-8 text-error"
        role="alert"
        data-testid="graph-error"
      >
        Couldn't load this service's compiled graph.
      </p>
      
      <p
        v-else-if="compileError && !graph"
        class="font-body text-caption mt-8 text-error"
        role="alert"
        data-testid="compile-error"
      >
        {{ compileError }}
      </p>

      <ScenarioPreviewPanel
        v-else
        :origin="origin"
        :isochrone-data="isochroneData"
        :loading="isochroneFormLoading"
        :error="isochroneError || compileError || null"
        :near-misses="nearMisses"
        :realised-clusters="realisedClusters"
        :services="services"
        :map-stations="mapStations"
        :map-routes="mapRoutes"
        :status-note="compiling ? 'This service changed — recompiling…' : null"
        @submit="handleIsochroneSubmit"
        @origin-change="onOriginChange"
      />

      
      <div class="mt-8 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-4">
        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Stops
          </h2>
          <p
            v-if="stops.length === 0"
            class="font-body text-caption mt-3 text-ink-muted italic"
            data-testid="service-stops-empty"
          >
            This service has no stops yet.
          </p>
          <ol
            v-else
            class="mt-3 flex flex-col gap-2"
          >
            <li
              v-for="stop in stops"
              :key="stop.seq"
              class="font-body text-caption flex justify-between gap-3 text-ink"
              data-testid="service-stop-row"
            >
              <span>{{ stop.seq + 1 }}. {{ stop.name }}</span>
              <span class="text-ink-muted">{{ stop.lat.toFixed(4) }}, {{ stop.lng.toFixed(4) }}</span>
            </li>
          </ol>
        </section>

        <TimeBetweenStations
          v-if="!stationTimesFailed"
          :groups="stationTimeGroups"
          :loading="!graph"
        />

        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Vehicle
          </h2>
          <dl class="font-body text-caption mt-3 flex flex-col gap-1 text-ink">
            <div class="flex justify-between gap-3">
              <dt class="text-ink-muted">
                Max speed
              </dt>
              <dd>{{ service.vehicle.max_speed_kmh }} km/h</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-ink-muted">
                Acceleration
              </dt>
              <dd>{{ service.vehicle.acceleration_ms2 }} m/s²</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-ink-muted">
                Deceleration
              </dt>
              <dd>{{ service.vehicle.deceleration_ms2 }} m/s²</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-ink-muted">
                Dwell
              </dt>
              <dd>{{ service.vehicle.dwell_s }} s</dd>
            </div>
          </dl>
        </section>

        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Frequency
          </h2>
          <p
            v-if="service.frequency_windows.length === 0"
            class="font-body text-caption mt-3 text-ink-muted italic"
            data-testid="service-windows-empty"
          >
            No frequency windows yet.
          </p>
          <ul
            v-else
            class="mt-3 flex flex-col gap-1"
          >
            <li
              v-for="(window, index) in service.frequency_windows"
              :key="index"
              class="font-body text-caption text-ink"
              data-testid="service-window-row"
            >
              {{ window.start_time }}–{{ window.end_time }}, every {{ Math.round(window.headway_s / 60) }} min
            </li>
          </ul>
        </section>
      </div>
    </template>
  </main>
</template>
