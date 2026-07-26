<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { compileService, fetchService, fetchServiceGraph, fetchServiceIsochrone } from '../api/authoring/services'
import { ApiError } from '../api/authoring/client'
import type { Service } from '../api/authoring/types'
import { useOwnedDetail } from '../composables/useOwnedDetail'
import { useAuthoredIsochrone } from '../composables/useAuthoredIsochrone'
import ScenarioPreviewPanel from '../components/ScenarioPreviewPanel.vue'
import TimeBetweenStations from '../components/TimeBetweenStations.vue'
import { graphStationTimeGroups } from '../components/stationTimes'
import { ACTION_LINK_CLASS } from '../components/linkStyles'

const props = defineProps<{ slug: string }>()

const { item: service, loading, notFound, error } = useOwnedDetail<Service>(fetchService, props.slug)

// seq is the authored order; don't trust the array to arrive in it.
const stops = computed(() => [...(service.value?.stops ?? [])].sort((a, b) => a.seq - b.seq))

// Named by the route, so plotting never waits on the detail fetch. Compiling a
// service alone is the degenerate one-member scenario, so this is the same
// stale-graph dance the scenario page does, against the service endpoints.
const {
  compiling,
  compileError,
  graph,
  setGraph,
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
} = useAuthoredIsochrone(() => props.slug, { compile: compileService, isochrone: fetchServiceIsochrone })

// The panel resolves service ids to names for its near-miss and cluster rows. A
// service is its own sole member, so this one record is the whole lookup — no
// need for the list fetch the scenario page makes.
const services = computed(() => (service.value ? [service.value] : []))

const graphError = ref('')

const stationTimeGroups = computed(() => graphStationTimeGroups(graph.value, services.value))

// Run times are read off the compiled graph, so a graph that never arrives
// takes the section with it rather than leaving it loading for good.
const stationTimesFailed = computed(() => Boolean(graphError.value || (compileError.value && !graph.value)))

// Read the existing compiled graph rather than recompiling on every visit. A
// 404 means this service has never compiled, which is a reason to compile, not
// an error to show; anything else is a genuine failure.
watch(service, async (loaded) => {
  if (!loaded) return
  try {
    setGraph(await fetchServiceGraph(loaded.slug))
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      await triggerCompile(loaded.slug)
    } else {
      graphError.value = "Couldn't load this service's compiled graph."
    }
  }
}, { immediate: true })
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <router-link
      to="/authoring"
      :class="ACTION_LINK_CLASS"
      data-testid="back-to-authoring"
    >
      ← My authoring
    </router-link>

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
      <hgroup class="mt-8 flex flex-col gap-2">
        <h1 class="font-display text-display text-ink-true">
          {{ service.name }}
        </h1>
        <p class="font-body text-micro text-ink-muted uppercase">
          {{ service.slug }}
        </p>
      </hgroup>
      <p
        v-if="service.description"
        class="font-body text-body mt-3 max-w-[720px] text-ink"
      >
        {{ service.description }}
      </p>

      <!-- The render is why the page gets opened, so it sits above the text
           sections — the same ordering as the scenario detail page. -->
      <p
        v-if="compiling && !graph"
        class="font-body text-caption mt-8 text-ink-muted italic"
        data-testid="compiling-status"
      >
        Compiling this service…
      </p>
      <p
        v-else-if="graphError"
        class="font-body text-caption mt-8 text-coral"
        role="alert"
        data-testid="graph-error"
      >
        {{ graphError }}
      </p>
      <!-- A failed compile only replaces the preview while there is no graph
           to show; once one has loaded, a failed recompile is reported beside
           the map rather than taking the plotted isochrone with it. -->
      <p
        v-else-if="compileError && !graph"
        class="font-body text-caption mt-8 text-coral"
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

      <!-- The supporting detail, as equal cards that flow into as many columns
           as the viewport has room for rather than one stack per column.
           auto-fill, not auto-fit: a leftover track stays empty so the cards
           keep a readable width instead of stretching to fill the row. -->
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
