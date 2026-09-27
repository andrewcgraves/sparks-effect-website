<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useServiceDraft } from '../composables/useServiceDraft'
import { MAX_DESCRIPTION_CHARS, MAX_SUBTEXT_CHARS, type GraphEdge, type SnapCoord as LatLng } from '../api/authoring'
import MapView from '../components/MapView.vue'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TOGGLE_BUTTON_CLASS } from '../components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'
import { ACTION_LINK_CLASS } from '../components/linkStyles'
import { formatRunTime } from '../components/stationTimes'
import { STOP_PLACEMENT_CUE } from '../components/placementCues'

// One view for both writes. The form, the map, the snap preview and fault
// attribution are the same whichever way a draft is headed; only the edges
// differ — the heading, the button, and where a save ends up.
const props = defineProps<{ slug?: string }>()

const router = useRouter()

const {
  ready,
  editing,
  editNotFound,
  editLoadFailed,
  routeMissing,
  stops,
  frequencyWindows,
  routeSlug,
  name,
  subtext,
  description,
  maxSpeedKmh,
  accelerationMs2,
  decelerationMs2,
  dwellS,
  routes,
  routesLoading,
  routesError,
  mapRoutes,
  selectRoute,
  addStop,
  addStopAt,
  updateStop,
  removeStop,
  moveStop,
  dragStop,
  dropStop,
  addFrequencyWindow,
  removeFrequencyWindow,
  preview,
  previewLoading,
  previewError,
  stopPreviewPairs,
  orderWarning,
  canSubmit,
  submitting,
  submitted,
  submitError,
  faultedStops,
  stopFaultMessage,
  submit,
  discardEdit,
  startAnother,
  compiling,
  compileError,
  compiledGraph,
  start,
  dispose,
} = useServiceDraft(props.slug)

const servicePath = computed(() => `/authoring/services/${props.slug}`)

const submitLabel = computed(() => {
  if (props.slug) return submitting.value ? 'Saving…' : 'Save changes'
  return submitting.value ? 'Creating…' : 'Create service'
})

const newStopName = ref('')
const newStopLat = ref<number | null>(null)
const newStopLng = ref<number | null>(null)

const newWindowStart = ref('06:00')
const newWindowEnd = ref('22:00')
const newWindowHeadwayMin = ref<number | null>(null)

const placingStops = ref(false)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  void start()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  dispose()
})

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') placingStops.value = false
}

function handleAddStop(): void {
  if (newStopLat.value === null || newStopLng.value === null) return
  addStop({ name: newStopName.value, lat: newStopLat.value, lng: newStopLng.value })
  newStopName.value = ''
  newStopLat.value = null
  newStopLng.value = null
}

function handleAddFrequencyWindow(): void {
  if (newWindowHeadwayMin.value === null || newWindowHeadwayMin.value <= 0) return
  addFrequencyWindow({
    start_time: newWindowStart.value,
    end_time: newWindowEnd.value,
    headway_s: Math.round(newWindowHeadwayMin.value * 60),
  })
  newWindowHeadwayMin.value = null
}

function handleStopDrag(pairId: string, coord: LatLng): void {
  dragStop(Number(pairId), coord)
}

function handleStopDragEnd(pairId: string, coord: LatLng): void {
  dropStop(Number(pairId), coord)
}

// Discarded before leaving, because leaving first would stop the gate the
// discard is checked against.
async function handleDiscard(): Promise<void> {
  discardEdit()
  await router.push(servicePath.value)
}

// An edit ends on the page of the service it saved over, but only once the
// recompile has landed: that page reads the latest compile that succeeded, so
// arriving any sooner would show the graph from before the edit. Replaced
// rather than pushed, so going back does not reopen a finished edit.
watch(compiledGraph, (graph) => {
  if (graph && props.slug) void router.replace(servicePath.value)
})

const allEdges = computed<GraphEdge[]>(() => compiledGraph.value?.services.flatMap((s) => s.edges) ?? [])
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <router-link
      v-if="slug"
      :to="servicePath"
      :class="ACTION_LINK_CLASS"
      data-testid="back-to-service"
    >
      ← {{ editing?.name ?? 'Service' }}
    </router-link>
    <h1
      class="font-display text-display text-ink-true"
      :class="{ 'mt-8': slug }"
    >
      {{ slug ? 'Edit service' : 'New service' }}
    </h1>

    <p
      v-if="editNotFound"
      class="font-body text-body mt-3 text-ink-muted"
      data-testid="service-not-found"
    >
      No service of yours matches "{{ slug }}".
    </p>
    <p
      v-else-if="editLoadFailed"
      class="font-body text-body mt-3 text-ink-muted"
      role="alert"
      data-testid="service-error"
    >
      Failed to load this service. Please try again.
    </p>

    <p
      v-else-if="!submitted && !ready"
      class="font-body text-body mt-8 text-ink-muted"
      data-testid="draft-loading"
    >
      {{ slug ? 'Loading service…' : 'Loading…' }}
    </p>

    <template v-else-if="!submitted">
      <div class="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_1fr]">
        <form
          class="flex flex-col gap-6"
          @submit.prevent="submit"
        >
          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <h2 class="font-display text-h3 text-ink-true">
              Route
            </h2>
            <p
              v-if="routesLoading"
              class="font-body text-caption mt-2 text-ink-muted italic"
            >
              Loading routes…
            </p>
            <p
              v-else-if="routesError"
              class="font-body text-caption mt-2 text-coral"
              role="alert"
              data-testid="routes-error"
            >
              Couldn't load routes.
            </p>
            <label
              v-else
              :class="[FIELD_LABEL_CLASS, 'mt-2']"
            >
              Pick a route
              <select
                :value="routeSlug"
                :class="FIELD_INPUT_CLASS"
                data-testid="route-select"
                @change="selectRoute(($event.target as HTMLSelectElement).value)"
              >
                <option
                  value=""
                  disabled
                >
                  Select a route…
                </option>
                <option
                  v-for="r in routes"
                  :key="r.slug"
                  :value="r.slug"
                >
                  {{ r.name }} ({{ r.mode }})
                </option>
              </select>
            </label>
            <p
              v-if="routeMissing"
              class="font-body text-caption mt-2 text-coral"
              role="alert"
              data-testid="route-missing"
            >
              Couldn't recover this service's route. Pick it again to save.
            </p>
          </section>

          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-h3 text-ink-true">
                Stops
              </h2>
              <button
                type="button"
                :class="TOGGLE_BUTTON_CLASS"
                data-testid="toggle-place-stops"
                :aria-pressed="placingStops"
                @click="placingStops = !placingStops"
              >
                {{ placingStops ? 'Done adding' : 'Add stops by clicking' }}
              </button>
            </div>

            <ul
              v-if="stops.length"
              class="mt-3 flex flex-col gap-2"
              data-testid="stops-list"
            >
              <li
                v-for="(stop, index) in stops"
                :key="index"
                class="font-body text-caption flex items-center justify-between gap-2 rounded-(--radius-field) border border-border bg-white px-3 py-2 text-ink"
                data-testid="stop-row"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <input
                    :value="stop.name"
                    class="w-28 border-b border-transparent bg-transparent font-medium not-italic normal-case hover:border-border focus:border-border focus:outline-none"
                    :data-testid="`stop-edit-name-${index}`"
                    type="text"
                    @change="updateStop(index, { name: ($event.target as HTMLInputElement).value })"
                  >
                  <input
                    :value="stop.lat"
                    class="w-20 border-b border-transparent bg-transparent text-ink-muted not-italic normal-case hover:border-border focus:border-border focus:outline-none"
                    :data-testid="`stop-edit-lat-${index}`"
                    type="number"
                    step="any"
                    @change="updateStop(index, { lat: Number(($event.target as HTMLInputElement).value) })"
                  >
                  <input
                    :value="stop.lng"
                    class="w-20 border-b border-transparent bg-transparent text-ink-muted not-italic normal-case hover:border-border focus:border-border focus:outline-none"
                    :data-testid="`stop-edit-lng-${index}`"
                    type="number"
                    step="any"
                    @change="updateStop(index, { lng: Number(($event.target as HTMLInputElement).value) })"
                  >
                  <span
                    v-if="preview?.stops[index]?.off_route"
                    class="text-coral"
                    data-testid="stop-off-route"
                  >
                    {{ Math.round(preview!.stops[index].offset_m) }}m off the route
                  </span>
                  <span
                    v-if="faultedStops.has(stop.seq)"
                    class="text-coral"
                    data-testid="stop-submit-error"
                  >
                    {{ stopFaultMessage(faultedStops.get(stop.seq)!) }}
                  </span>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button
                    type="button"
                    class="cursor-pointer px-1 text-ink-muted hover:text-ink"
                    :data-testid="`stop-up-${index}`"
                    :disabled="index === 0"
                    @click="moveStop(index, -1)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer px-1 text-ink-muted hover:text-ink"
                    :data-testid="`stop-down-${index}`"
                    :disabled="index === stops.length - 1"
                    @click="moveStop(index, 1)"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer px-1 text-ink-muted hover:text-coral"
                    :data-testid="`stop-remove-${index}`"
                    @click="removeStop(index)"
                  >
                    ✕
                  </button>
                </div>
              </li>
            </ul>

            <p
              v-if="previewLoading"
              class="font-body text-caption mt-2 text-ink-muted italic"
              data-testid="preview-loading"
            >
              Checking against the route…
            </p>
            <p
              v-if="previewError"
              class="font-body text-caption mt-2 text-coral"
              role="alert"
              data-testid="preview-error"
            >
              Couldn't preview the snap. You can still add stops.
            </p>
            <p
              v-if="orderWarning"
              class="font-body text-caption mt-2 text-coral"
              role="alert"
              data-testid="order-warning"
            >
              {{ orderWarning }}
            </p>

            
            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <label :class="[FIELD_LABEL_CLASS, 'col-span-2 sm:col-span-1']">
                Name
                <input
                  v-model="newStopName"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="stop-name"
                  type="text"
                >
              </label>
              <label :class="FIELD_LABEL_CLASS">
                Lat
                <input
                  v-model.number="newStopLat"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="stop-lat"
                  type="number"
                  step="any"
                >
              </label>
              <label :class="FIELD_LABEL_CLASS">
                Lng
                <input
                  v-model.number="newStopLng"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="stop-lng"
                  type="number"
                  step="any"
                >
              </label>
              <button
                type="button"
                :class="[SECONDARY_BUTTON_CLASS, 'col-span-2 mt-2 sm:col-span-1 sm:mt-auto']"
                data-testid="add-stop"
                @click="handleAddStop"
              >
                Add
              </button>
            </div>
          </section>

          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <h2 class="font-display text-h3 text-ink-true">
              Vehicle
            </h2>
            <div class="mt-2 grid grid-cols-2 gap-3">
              <label :class="FIELD_LABEL_CLASS">
                Max speed (km/h)
                <input
                  v-model.number="maxSpeedKmh"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="vehicle-max-speed"
                  type="number"
                  min="0"
                >
              </label>
              <label :class="FIELD_LABEL_CLASS">
                Acceleration (m/s²)
                <input
                  v-model.number="accelerationMs2"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="vehicle-acceleration"
                  type="number"
                  min="0"
                  step="0.1"
                >
              </label>
              <label :class="FIELD_LABEL_CLASS">
                Deceleration (m/s²)
                <input
                  v-model.number="decelerationMs2"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="vehicle-deceleration"
                  type="number"
                  min="0"
                  step="0.1"
                >
              </label>
              <label :class="FIELD_LABEL_CLASS">
                Dwell (s)
                <input
                  v-model.number="dwellS"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="vehicle-dwell"
                  type="number"
                  min="0"
                >
              </label>
            </div>
          </section>

          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <h2 class="font-display text-h3 text-ink-true">
              Frequency windows
            </h2>
            <ul
              v-if="frequencyWindows.length"
              class="mt-3 flex flex-col gap-2"
              data-testid="frequency-list"
            >
              <li
                v-for="(window, index) in frequencyWindows"
                :key="index"
                class="font-body text-caption flex items-center justify-between gap-2 rounded-(--radius-field) border border-border bg-white px-3 py-2 text-ink"
              >
                <span>{{ window.start_time }}–{{ window.end_time }}, every {{ Math.round(window.headway_s / 60) }} min</span>
                <button
                  type="button"
                  class="cursor-pointer px-1 text-ink-muted hover:text-coral"
                  :data-testid="`frequency-remove-${index}`"
                  @click="removeFrequencyWindow(index)"
                >
                  ✕
                </button>
              </li>
            </ul>

            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <label :class="FIELD_LABEL_CLASS">
                Start
                <input
                  v-model="newWindowStart"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="frequency-start"
                  type="time"
                >
              </label>
              <label :class="FIELD_LABEL_CLASS">
                End
                <input
                  v-model="newWindowEnd"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="frequency-end"
                  type="time"
                >
              </label>
              <label :class="FIELD_LABEL_CLASS">
                Headway (min)
                <input
                  v-model.number="newWindowHeadwayMin"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="frequency-headway"
                  type="number"
                  min="1"
                >
              </label>
              <button
                type="button"
                :class="[SECONDARY_BUTTON_CLASS, 'mt-2 sm:mt-auto']"
                data-testid="add-frequency"
                @click="handleAddFrequencyWindow"
              >
                Add
              </button>
            </div>
          </section>

          <label :class="FIELD_LABEL_CLASS">
            Service name
            <input
              v-model="name"
              :class="FIELD_INPUT_CLASS"
              data-testid="service-name"
              type="text"
            >
          </label>

          <label :class="FIELD_LABEL_CLASS">
            Subtext (optional)
            <input
              v-model="subtext"
              :class="FIELD_INPUT_CLASS"
              data-testid="service-subtext"
              type="text"
              :maxlength="MAX_SUBTEXT_CHARS"
              placeholder="Electrified · High-speed rail · Greenfield"
            >
          </label>

          <label :class="FIELD_LABEL_CLASS">
            Description (optional)
            <textarea
              v-model="description"
              :class="FIELD_INPUT_CLASS"
              data-testid="service-description"
              rows="5"
              :maxlength="MAX_DESCRIPTION_CHARS"
            />
          </label>

          <button
            type="submit"
            :class="PRIMARY_BUTTON_CLASS"
            data-testid="submit"
            :disabled="!canSubmit"
          >
            {{ submitLabel }}
          </button>

          <button
            v-if="slug"
            type="button"
            :class="[ACTION_LINK_CLASS, 'self-start']"
            data-testid="discard-edit"
            :disabled="submitting"
            @click="handleDiscard"
          >
            Discard changes
          </button>

          <p
            v-if="submitError"
            class="font-body text-caption text-coral"
            role="alert"
            data-testid="submit-error"
          >
            {{ submitError }}
          </p>
        </form>

        <div class="h-[70vh]">
          <MapView
            :loading="false"
            :isochrone-data="null"
            :routes="mapRoutes"
            :stations="[]"
            :stop-preview-pairs="stopPreviewPairs"
            :placement-armed="placingStops"
            :placement-cue="STOP_PLACEMENT_CUE"
            hide-isochrone-legend
            @map-click="addStopAt"
            @stop-drag="handleStopDrag"
            @stop-drag-end="handleStopDragEnd"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="mt-8 max-w-[560px] rounded-(--radius-box) border border-border bg-surface p-4">
        <p
          v-if="compiling"
          class="font-body text-caption text-ink-muted italic"
          data-testid="compiling-status"
        >
          {{ slug ? 'Changes saved. Compiling…' : 'Service created. Compiling…' }}
        </p>
        <p
          v-else-if="compileError"
          class="font-body text-caption text-coral"
          role="alert"
          data-testid="compile-error"
        >
          {{ compileError }}
        </p>
        <div
          v-else-if="compiledGraph && !slug"
          data-testid="compile-result"
        >
          <h2 class="font-display text-h3 text-ink-true">
            Compiled
          </h2>
          <p class="font-body text-caption mt-2 text-ink-muted">
            {{ compiledGraph.services.length }} service(s), {{ allEdges.length }} edges
          </p>
          <table
            v-if="allEdges.length"
            class="font-body text-caption mt-3 w-full text-ink"
          >
            <thead>
              <tr class="text-ink-muted">
                <th class="text-left font-normal">
                  From
                </th>
                <th class="text-left font-normal">
                  To
                </th>
                <th class="text-left font-normal">
                  Run time
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(edge, index) in allEdges"
                :key="index"
                data-testid="compile-edge-row"
              >
                <td>{{ edge.from_slug }}</td>
                <td>{{ edge.to_slug }}</td>
                <td>{{ formatRunTime(edge.seconds) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <router-link
          v-if="slug"
          :to="servicePath"
          :class="[SECONDARY_BUTTON_CLASS, 'mt-4 inline-block']"
          data-testid="view-service"
        >
          View service
        </router-link>
        <button
          v-else
          type="button"
          :class="[SECONDARY_BUTTON_CLASS, 'mt-4']"
          data-testid="start-another"
          @click="startAnother"
        >
          Author another service
        </button>
      </div>
    </template>
  </main>
</template>
