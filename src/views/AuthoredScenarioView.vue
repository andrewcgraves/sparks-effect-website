<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  compileScenario,
  fetchScenario,
  fetchScenarioGraph,
  fetchScenarioIsochrone,
  updateScenario,
} from '../api/authoring/scenarios'
import {
  hasInterchangePair,
  namesMembers,
  nearMissPair,
  sameInterchangePair,
  scenarioInput,
} from '../api/authoring/scenarioInput'
import { fetchMyServices } from '../api/authoring/services'
import type { InterchangePair, NearMiss, Scenario, StopIdentity } from '../api/authoring/types'
import { authoringFault } from '../api/authoringFault'
import { useOwnedDetail } from '../composables/useOwnedDetail'
import { useOwnedList } from '../composables/useOwnedList'
import { isochroneWaitMessage } from '../api/isochroneFault'
import { useAuthoredGraph } from '../composables/useAuthoredGraph'
import { usePageTitle } from '../composables/usePageTitle'
import { useScenarioDeletion } from '../composables/useDeletion'
import DeclaredInterchanges from '../components/DeclaredInterchanges.vue'
import { resolveStop } from '../components/interchangeStops'
import ScenarioPreviewPanel from '../components/ScenarioPreviewPanel.vue'
import TimeBetweenStations from '../components/TimeBetweenStations.vue'
import { graphStationTimeGroups } from '../components/stationTimes'
import { ACTION_LINK_CLASS } from '../components/linkStyles'
import BreadcrumbTrail from '../components/BreadcrumbTrail.vue'
import { AUTHORING_CRUMB } from '../components/crumbs'
import DeleteMenu from '../components/DeleteMenu.vue'
import PageSkeleton from '../components/PageSkeleton.vue'

const props = defineProps<{ slug: string }>()

const { item: scenario, loading, notFound, error } = useOwnedDetail<Scenario>(fetchScenario, props.slug)

usePageTitle(() => scenario.value?.name)

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
  isochroneProgress,
  isochroneFormLoading,
  nearMisses,
  realisedClusters,
  mapStations,
  mapRoutes,
  onOriginChange,
  handleIsochroneSubmit,
} = useAuthoredGraph(() => props.slug, {
  compile: compileScenario,
  noun: 'scenario',
  fetchGraph: fetchScenarioGraph,
  isochrone: fetchScenarioIsochrone,
})

const { items: services } = useOwnedList(fetchMyServices)

const stationTimeGroups = computed(() => graphStationTimeGroups(graph.value, services.value))

const stationTimesFailed = computed(() => Boolean(graphFailed.value || (compileError.value && !graph.value)))

const { deleting, confirmAndDelete } = useScenarioDeletion()

// Keyed on the slug, not the scenario: saving an interchange replaces the
// scenario, and reloading the graph then would abandon the recompile the save
// has just started.
watch(() => scenario.value?.slug, (slug) => {
  if (slug) void loadGraph(slug)
}, { immediate: true })

const interchangePairs = computed(() => scenario.value?.interchange_pairs ?? [])
const savingInterchanges = ref(false)
const recompilingInterchanges = ref(false)
const interchangeError = ref('')
const interchangeBusy = computed(() => savingInterchanges.value || compiling.value)

function stopMissing(stop: StopIdentity): boolean {
  return resolveStop(stop, scenario.value?.service_ids ?? [], services.value).missing
}

const statusNote = computed(() => {
  if (savingInterchanges.value) return 'Saving interchanges…'
  if (recompilingInterchanges.value) return 'Interchanges changed — recompiling…'
  return compiling.value ? 'A member line changed — recompiling…' : null
})

const declaredInterchanges = ref<InstanceType<typeof DeclaredInterchanges> | null>(null)
const pageHeading = ref<HTMLElement | null>(null)

// The button a join or removal started from has usually gone with its row by
// the time it finishes, which drops a keyboard user's focus to the page. Left
// alone if they have already moved on to something else.
async function settleFocus(): Promise<void> {
  await nextTick()
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body && active.isConnected
    && !(active instanceof HTMLButtonElement && active.disabled)) return
  if (!declaredInterchanges.value?.focusHeading()) pageHeading.value?.focus()
}

async function recompileInterchanges(slug: string): Promise<void> {
  recompilingInterchanges.value = true
  try {
    await triggerCompile(slug)
  } finally {
    recompilingInterchanges.value = false
  }
}

// The scenario is read again first: the copy loaded with the page can predate
// an edit made since in another tab, and writing it back whole would revert
// that edit. Only the pair change is applied to the fresh copy, then saved and
// recompiled the way the builder does — the near miss only becomes a realised
// interchange in a graph compiled with the pair. Pairs naming a line that has
// since left the network go too, or the API refuses the whole save.
async function saveInterchangePairs(change: (pairs: InterchangePair[]) => InterchangePair[]): Promise<void> {
  const slug = scenario.value?.slug
  if (!slug || interchangeBusy.value) return
  savingInterchanges.value = true
  interchangeError.value = ''
  try {
    const fresh = await fetchScenario(slug)
    const input = scenarioInput(fresh)
    input.interchange_pairs = change(input.interchange_pairs).filter((pair) => namesMembers(pair, input.service_ids))
    scenario.value = await updateScenario(slug, input)
  } catch (err) {
    interchangeError.value = authoringFault(err, 'scenario')
    return
  } finally {
    savingInterchanges.value = false
  }
  await recompileInterchanges(slug)
  await settleFocus()
}

function joinNearMiss(nearMiss: NearMiss): void {
  const pair = nearMissPair(nearMiss)
  if (hasInterchangePair(interchangePairs.value, pair)) return
  void saveInterchangePairs((pairs) => (hasInterchangePair(pairs, pair) ? pairs : [...pairs, pair]))
}

function removeInterchangePair(pair: InterchangePair): void {
  void saveInterchangePairs((pairs) => pairs.filter((declared) => !sameInterchangePair(declared, pair)))
}

async function recompileForInterchanges(): Promise<void> {
  const slug = scenario.value?.slug
  if (!slug || interchangeBusy.value) return
  await recompileInterchanges(slug)
  await settleFocus()
}
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <BreadcrumbTrail :items="[AUTHORING_CRUMB, { label: scenario?.name ?? 'Network' }]" />

    <PageSkeleton
      v-if="loading"
      label="Loading network"
      subtitle
      :cards="1"
      class="mt-8"
      data-testid="scenario-loading"
    />

    <template v-else-if="notFound">
      <h1 class="font-display text-display mt-8 text-ink-true">
        Network not found
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        data-testid="scenario-not-found"
      >
        No network of yours matches "{{ props.slug }}".
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
        Failed to load this network. Please try again.
      </p>
    </template>

    <template v-else-if="scenario">
      <div class="mt-8 flex items-start justify-between gap-4">
        <hgroup class="flex flex-col gap-2">
          <h1
            ref="pageHeading"
            tabindex="-1"
            class="font-display text-display text-ink-true"
          >
            {{ scenario.name }}
          </h1>
          <p class="font-body text-micro text-ink-muted uppercase">
            {{ scenario.slug }}
          </p>
        </hgroup>
        <div class="flex items-start gap-6">
          <router-link
            :to="`/authoring/scenarios/${scenario.slug}/edit`"
            :class="ACTION_LINK_CLASS"
            data-testid="edit-scenario"
          >
            Edit
          </router-link>
          <DeleteMenu
            noun="scenario"
            :deleting="deleting"
            @delete="confirmAndDelete(scenario)"
          />
        </div>
      </div>
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
        Compiling this network…
      </p>
      <p
        v-else-if="graphFailed"
        class="font-body text-caption mt-8 text-error"
        role="alert"
        data-testid="graph-error"
      >
        Couldn't load this network's compiled graph.
      </p>
      
      <template v-else-if="compileError && !graph">
        <p
          class="font-body text-caption mt-8 text-error"
          role="alert"
          data-testid="compile-error"
        >
          {{ compileError }}
        </p>
        <!-- A pair naming a stop that has gone fails every compile, so with no
             graph to preview this is the only place left to remove it. -->
        <div class="mt-4 flex max-w-[560px] flex-col gap-4">
          <DeclaredInterchanges
            ref="declaredInterchanges"
            :pairs="interchangePairs"
            :member-ids="scenario.service_ids"
            :services="services"
            :busy="interchangeBusy"
            :error="interchangeError"
            @remove="removeInterchangePair"
          />
        </div>
      </template>

      <ScenarioPreviewPanel
        v-else
        :origin="origin"
        :isochrone-data="isochroneData"
        :loading="isochroneFormLoading"
        :loading-message="isochroneWaitMessage(isochroneProgress)"
        :error="isochroneError || compileError || null"
        :near-misses="nearMisses"
        :realised-clusters="realisedClusters"
        :services="services"
        :map-stations="mapStations"
        :map-routes="mapRoutes"
        :status-note="statusNote"
        :interchange-pairs="interchangePairs"
        :interchange-busy="interchangeBusy"
        :stop-missing="stopMissing"
        @submit="handleIsochroneSubmit"
        @origin-change="onOriginChange"
        @join="joinNearMiss"
        @recompile="recompileForInterchanges"
      >
        <template #interchanges>
          <!-- The form's own error can be dismissed, and is easy to miss from
               here: a failed recompile is why a joined pair still reads as a
               near miss. -->
          <p
            v-if="compileError"
            class="font-body text-caption text-error"
            role="alert"
            data-testid="interchange-compile-error"
          >
            The preview is from the last compile that worked. {{ compileError }}
          </p>
          <DeclaredInterchanges
            ref="declaredInterchanges"
            :pairs="interchangePairs"
            :member-ids="scenario.service_ids"
            :services="services"
            :busy="interchangeBusy"
            :error="interchangeError"
            @remove="removeInterchangePair"
          />
        </template>
      </ScenarioPreviewPanel>

      
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
