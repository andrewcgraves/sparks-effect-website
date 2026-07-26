<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { compileScenario, fetchScenario, fetchScenarioGraph, fetchScenarioIsochrone } from '../api/authoring/scenarios'
import { fetchMyServices } from '../api/authoring/services'
import { ApiError } from '../api/authoring/client'
import type { Scenario } from '../api/authoring/types'
import { useOwnedDetail } from '../composables/useOwnedDetail'
import { useOwnedList } from '../composables/useOwnedList'
import { useAuthoredIsochrone } from '../composables/useAuthoredIsochrone'
import ScenarioPreviewPanel from '../components/ScenarioPreviewPanel.vue'
import TimeBetweenStations from '../components/TimeBetweenStations.vue'
import { graphStationTimeGroups } from '../components/stationTimes'
import { ACTION_LINK_CLASS } from '../components/linkStyles'

const props = defineProps<{ slug: string }>()

const { item: scenario, loading, notFound, error } = useOwnedDetail<Scenario>(fetchScenario, props.slug)

// Named by the route, so plotting never waits on the detail fetch.
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
} = useAuthoredIsochrone(() => props.slug, { compile: compileScenario, isochrone: fetchScenarioIsochrone })

// Near-miss rows name their services; the panel resolves ids against this.
const { items: services } = useOwnedList(fetchMyServices)

const graphError = ref('')

const stationTimeGroups = computed(() => graphStationTimeGroups(graph.value, services.value))

// Run times are read off the compiled graph, so a graph that never arrives
// takes the section with it rather than leaving it loading for good.
const stationTimesFailed = computed(() => Boolean(graphError.value || (compileError.value && !graph.value)))

// Read the existing compiled graph rather than recompiling on every visit. A
// 404 means this scenario has never compiled, which is a reason to compile,
// not an error to show; anything else is a genuine failure.
watch(scenario, async (loaded) => {
  if (!loaded) return
  try {
    setGraph(await fetchScenarioGraph(loaded.slug))
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      await triggerCompile(loaded.slug)
    } else {
      graphError.value = "Couldn't load this scenario's compiled graph."
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
      Loading scenario…
    </p>

    <template v-else-if="notFound">
      <h1 class="font-display text-display mt-8 text-ink-true">
        Scenario not found
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        data-testid="scenario-not-found"
      >
        No scenario of yours matches "{{ props.slug }}".
      </p>
    </template>

    <template v-else-if="error">
      <h1 class="font-display text-display mt-8 text-ink-true">
        Something went wrong
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        role="alert"
        data-testid="scenario-error"
      >
        Failed to load this scenario. Please try again.
      </p>
    </template>

    <template v-else-if="scenario">
      <hgroup class="mt-8 flex flex-col gap-2">
        <h1 class="font-display text-display text-ink-true">
          {{ scenario.name }}
        </h1>
        <p class="font-body text-micro text-ink-muted uppercase">
          {{ scenario.slug }}
        </p>
      </hgroup>
      <p
        v-if="scenario.description"
        class="font-body text-body mt-3 max-w-[720px] text-ink"
      >
        {{ scenario.description }}
      </p>

      <p
        v-if="compiling && !graph"
        class="font-body text-caption mt-8 text-ink-muted italic"
        data-testid="compiling-status"
      >
        Compiling this scenario…
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
        :graph="graph"
        :status-note="compiling ? 'A member service changed — recompiling…' : null"
        @submit="handleIsochroneSubmit"
        @origin-change="onOriginChange"
      />

      <!-- Sized as one card in the same flowing grid the service page uses, so
           the run times sit at a readable width rather than spanning the page
           and so later cards slot in beside them. -->
      <div
        v-if="!stationTimesFailed"
        class="mt-8 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-4"
      >
        <TimeBetweenStations
          :groups="stationTimeGroups"
          :loading="!graph"
        />
      </div>
    </template>
  </main>
</template>
