<script setup lang="ts">
import { watch } from 'vue'
import { fetchScenario, fetchScenarioGraph } from '../api/authoring/scenarios'
import { ApiError } from '../api/authoring/client'
import type { Scenario } from '../api/authoring/types'
import { fetchMyServices } from '../api/authoring/services'
import { useOwnedDetail } from '../composables/useOwnedDetail'
import { useOwnedList } from '../composables/useOwnedList'
import { useScenarioIsochrone } from '../composables/useScenarioIsochrone'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from '../components/MapView.vue'
import { ACTION_LINK_CLASS } from '../components/linkStyles'

const props = defineProps<{ slug: string }>()

const { item: scenario, loading, notFound, error } = useOwnedDetail<Scenario>(fetchScenario, props.slug)

const {
  compiling,
  compileError,
  setGraph,
  triggerCompile,
  origin,
  isochroneData,
  isochroneError,
  isochroneFormLoading,
  nearMisses,
  realisedClusters,
  onOriginChange,
  handleIsochroneSubmit,
} = useScenarioIsochrone(() => scenario.value?.slug ?? null)

// Read the existing compiled graph rather than recompiling on every visit; a
// 404 means this scenario has never compiled, which is a reason to compile,
// not an error to show.
watch(scenario, async (loaded) => {
  if (!loaded) return
  try {
    setGraph(await fetchScenarioGraph(loaded.slug))
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      await triggerCompile(loaded.slug)
    }
  }
}, { immediate: true })

// Near-misses name stops by service_id; the compile result doesn't carry
// display names, so resolve them against the owner's own services. A failed
// lookup degrades to the id rather than hiding the report.
const { items: services } = useOwnedList(fetchMyServices)

function serviceName(serviceId: string): string {
  return services.value.find((service) => service.id === serviceId)?.name ?? serviceId
}

function formatMeters(total: number): string {
  return `${Math.round(total)} m`
}
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
        v-if="compileError"
        class="font-body text-caption mt-8 text-coral"
        role="alert"
        data-testid="compile-error"
      >
        {{ compileError }}
      </p>

      <div
        v-else
        class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]"
      >
        <div class="h-[70vh] overflow-hidden rounded-(--radius-box) border border-border">
          <MapView
            :origin="origin"
            :isochrone-data="isochroneData"
            :loading="isochroneFormLoading"
            :routes="[]"
            :stations="[]"
            :services="[]"
          />
        </div>

        <div class="flex flex-col gap-4">
          <IsochroneForm
            :error="isochroneError"
            :loading="isochroneFormLoading"
            @submit="handleIsochroneSubmit"
            @origin-change="onOriginChange"
          />
          <p
            v-if="compiling"
            class="font-body text-caption text-ink-muted italic"
            role="status"
            data-testid="compiling-status"
          >
            Compiling this scenario…
          </p>

          <section
            v-if="nearMisses.length"
            class="rounded-(--radius-box) border border-border bg-surface p-4"
            data-testid="near-miss-list"
          >
            <h2 class="font-display text-h3 text-ink-true">
              Did not connect
            </h2>
            <ul class="mt-3 flex flex-col gap-2">
              <li
                v-for="(nearMiss, index) in nearMisses"
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
            v-if="realisedClusters.length"
            class="rounded-(--radius-box) border border-border bg-surface p-4"
            data-testid="realised-clusters"
          >
            <h2 class="font-display text-h3 text-ink-true">
              Realised interchanges
            </h2>
            <ul class="mt-3 flex flex-col gap-2">
              <li
                v-for="cluster in realisedClusters"
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
  </main>
</template>
