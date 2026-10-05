<script setup lang="ts">
import { computed } from 'vue'
import { fetchPublicationIsochrone, fetchServicePublication } from '../api/publications'
import { isochroneWaitMessage } from '../api/isochroneFault'
import { useAuthoredGraph } from '../composables/useAuthoredGraph'
import { usePageTitle } from '../composables/usePageTitle'
import AllLinesLink from '../components/AllLinesLink.vue'
import { useIsochroneQuery } from '../composables/useIsochroneQuery'
import CopyLinkButton from '../components/CopyLinkButton.vue'
import ScenarioPreviewPanel from '../components/ScenarioPreviewPanel.vue'
import TimeBetweenStations from '../components/TimeBetweenStations.vue'
import PageSkeleton from '../components/PageSkeleton.vue'
import { graphStationTimeGroups } from '../components/stationTimes'

const props = defineProps<{ slug: string }>()

// A pinned target: no `compile`, so nothing on this page can compile — the
// reader has no session to compile with, and the publication's graph cannot go
// stale. The publication and its graph are one response, so the graph read is
// the page's only read.
const {
  graph,
  loadedGraph: publication,
  graphFailed,
  graphNotFound,
  loadGraph,
  origin,
  isochroneData,
  isochroneError,
  isochroneProgress,
  isochroneFormLoading,
  nearMisses,
  realisedClusters,
  mapStations,
  mapRoutes,
  onOriginChange,
  handleIsochroneSubmit,
} = useAuthoredGraph(() => props.slug, {
  fetchGraph: fetchServicePublication,
  isochrone: fetchPublicationIsochrone,
})

// Unpublished and unknown are one 404, here as in the API, and the not-found
// copy keeps it that way: saying which would tell a stranger that a draft sits
// behind a guessed slug.
const loading = computed(() => !publication.value && !graphFailed.value && !graphNotFound.value)

usePageTitle(() => publication.value?.name)

const services = computed(() =>
  publication.value ? [{ id: publication.value.user_service_id, name: publication.value.name }] : [],
)

const stationTimeGroups = computed(() => graphStationTimeGroups(graph.value, services.value))

// A publication carries no stop rows, only the graph compiled from them, so the
// stop list is read off the same outbound run the time-between-stations card
// draws — the two cannot disagree about the order. A service with a single stop
// has no edges to read, and lists its one station.
const stops = computed(() => {
  const outbound = stationTimeGroups.value[0]?.directions[0]?.rows ?? []
  if (outbound.length) return [outbound[0].from, ...outbound.map((row) => row.to)]
  return mapStations.value.map((station) => station.name)
})

// Waits for the publication: a link to an unpublished service must not spend
// a routing job on a page that will only say "not found".
const { initial: linkedIsochrone, submit: submitIsochrone, shareable } = useIsochroneQuery({
  plot: handleIsochroneSubmit,
  plotted: () => isochroneData.value !== null && isochroneError.value === null,
  ready: () => publication.value !== null,
})

void loadGraph(props.slug)
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <div class="mb-8">
      <AllLinesLink />
    </div>

    <PageSkeleton
      v-if="loading"
      label="Loading service"
      :cards="2"
      data-testid="service-loading"
    />

    <template v-else-if="graphNotFound">
      <h1 class="font-display text-display text-ink-true">
        Service not found
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        data-testid="service-not-found"
      >
        No published service lives at "{{ props.slug }}".
      </p>
    </template>

    <template v-else-if="graphFailed">
      <h1 class="font-display text-display text-ink-true">
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

    <template v-else-if="publication">
      <hgroup class="flex max-w-[720px] flex-col gap-2">
        <h1 class="font-display text-display text-ink-true">
          {{ publication.name }}
        </h1>
        <p
          v-if="publication.subtext"
          class="font-body text-micro text-ink-muted italic uppercase"
          data-testid="service-subtext"
        >
          {{ publication.subtext }}
        </p>
      </hgroup>

      <ScenarioPreviewPanel
        :origin="origin"
        :isochrone-data="isochroneData"
        :loading="isochroneFormLoading"
        :loading-message="isochroneWaitMessage(isochroneProgress)"
        :error="isochroneError"
        :near-misses="nearMisses"
        :realised-clusters="realisedClusters"
        :services="services"
        :map-stations="mapStations"
        :map-routes="mapRoutes"
        :initial="linkedIsochrone"
        @submit="submitIsochrone"
        @origin-change="onOriginChange"
      >
        <template #after-form>
          <CopyLinkButton v-if="shareable" />
        </template>
      </ScenarioPreviewPanel>

      <div class="mt-8 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-4">
        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Stops
          </h2>
          <ol class="mt-3 flex flex-col gap-2">
            <li
              v-for="(name, index) in stops"
              :key="index"
              class="font-body text-caption text-ink"
              data-testid="service-stop-row"
            >
              {{ index + 1 }}. {{ name }}
            </li>
          </ol>
        </section>

        <TimeBetweenStations :groups="stationTimeGroups" />
      </div>

      <section
        v-if="publication.description"
        class="mt-16 max-w-[720px]"
      >
        <h2 class="font-display text-h2 text-ink-true">
          Description
        </h2>
        <p
          class="font-body text-body mt-3 whitespace-pre-line text-ink-muted"
          data-testid="service-description"
        >
          {{ publication.description }}
        </p>
      </section>
    </template>
  </main>
</template>
