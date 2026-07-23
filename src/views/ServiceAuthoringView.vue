<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDraftsStore } from '../stores/drafts'
import { useJobsStore } from '../stores/jobs'
import { ApiError } from '../api/authoring/client'
import { fetchRoute, listRoutes, snapStops } from '../api/authoring/routes'
import { compileService, createService } from '../api/authoring/services'
import type {
  GraphEdge,
  Route,
  RouteSummary,
  SnapStopsResponse,
  TransitGraph,
  VehicleParams,
} from '../api/authoring'
import type { Route as ScenarioRoute } from '../api/scenarios'
import MapView from '../components/MapView.vue'
import type { StopPreviewPair } from '../composables/useStopPreviewLayer'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'

const drafts = useDraftsStore()
const jobs = useJobsStore()

const routes = ref<RouteSummary[]>([])
const routesLoading = ref(true)
const routesError = ref(false)

const selectedRoute = ref<Route | null>(null)

const preview = ref<SnapStopsResponse | null>(null)
const previewLoading = ref(false)
const previewError = ref(false)

const newStopName = ref('')
const newStopLat = ref<number | null>(null)
const newStopLng = ref<number | null>(null)

const newWindowStart = ref('06:00')
const newWindowEnd = ref('22:00')
const newWindowHeadwayMin = ref<number | null>(null)

const submitted = ref(false)
const submitting = ref(false)
const submitError = ref('')
const compiling = ref(false)
const compileError = ref('')
const compiledGraph = ref<TransitGraph | null>(null)

// Live preview trades a little latency for not hammering the snap endpoint on
// every keystroke; 400ms is long enough to coalesce a burst of edits and short
// enough that the preview still feels immediate.
const PREVIEW_DEBOUNCE_MS = 400
let previewTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  if (!drafts.hasServiceDraft) drafts.startServiceDraft()
  try {
    routes.value = await listRoutes()
  } catch {
    routesError.value = true
  } finally {
    routesLoading.value = false
  }
})

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})

const routeSlug = computed({
  get: () => drafts.serviceDraft?.route_slug ?? '',
  set: (value: string) => drafts.patchServiceDraft({ route_slug: value }),
})

const name = computed({
  get: () => drafts.serviceDraft?.name ?? '',
  set: (value: string) => drafts.patchServiceDraft({ name: value }),
})

function patchVehicle(patch: Partial<VehicleParams>): void {
  if (!drafts.serviceDraft) return
  drafts.patchServiceDraft({ vehicle: { ...drafts.serviceDraft.vehicle, ...patch } })
}

const maxSpeedKmh = computed({
  get: () => drafts.serviceDraft?.vehicle.max_speed_kmh ?? 0,
  set: (value: number) => patchVehicle({ max_speed_kmh: value }),
})
const accelerationMs2 = computed({
  get: () => drafts.serviceDraft?.vehicle.acceleration_ms2 ?? 0,
  set: (value: number) => patchVehicle({ acceleration_ms2: value }),
})
const decelerationMs2 = computed({
  get: () => drafts.serviceDraft?.vehicle.deceleration_ms2 ?? 0,
  set: (value: number) => patchVehicle({ deceleration_ms2: value }),
})
const dwellS = computed({
  get: () => drafts.serviceDraft?.vehicle.dwell_s ?? 0,
  set: (value: number) => patchVehicle({ dwell_s: value }),
})

const mapRoutes = computed<ScenarioRoute[]>(() => {
  if (!selectedRoute.value) return []
  const r = selectedRoute.value
  return [{
    id: r.id,
    scenario_id: r.scenario_id ?? '',
    name: r.name,
    mode: r.mode,
    geometry: r.geometry,
    bidirectional: r.bidirectional,
  }]
})

async function handleRouteChange(): Promise<void> {
  selectedRoute.value = null
  preview.value = null
  const slug = routeSlug.value
  if (!slug) return
  try {
    selectedRoute.value = await fetchRoute(slug)
  } catch {
    // Geometry is a best-effort map preview; the picker itself still works
    // without it, so a fetch failure here is silently swallowed.
  }
  schedulePreview()
}

function schedulePreview(): void {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => void runPreview(), PREVIEW_DEBOUNCE_MS)
}

async function runPreview(): Promise<void> {
  const draft = drafts.serviceDraft
  if (!draft || !draft.route_slug || draft.stops.length === 0) {
    preview.value = null
    return
  }
  previewLoading.value = true
  previewError.value = false
  try {
    preview.value = await snapStops(
      draft.route_slug,
      draft.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    )
  } catch {
    previewError.value = true
  } finally {
    previewLoading.value = false
  }
}

watch(
  () => [drafts.serviceDraft?.route_slug, drafts.serviceDraft?.stops],
  () => schedulePreview(),
)

const stopPreviewPairs = computed<StopPreviewPair[]>(() => {
  const stops = drafts.serviceDraft?.stops ?? []
  return stops.map((stop, index) => {
    const snapped = preview.value?.stops[index]
    return {
      id: String(index),
      raw: { lat: stop.lat, lng: stop.lng },
      snapped: snapped ? snapped.snapped : null,
      offRoute: snapped?.off_route ?? false,
    }
  })
})

// The preview endpoint reports only whether the order disagrees, not which
// pair — the write path's 422 names the pair, but by the time that fires the
// user should already have fixed it here. Rendering the along-the-line order
// lets them compare it to what they authored and reorder by hand.
const orderWarning = computed<string | null>(() => {
  if (!preview.value || preview.value.order_is_consistent) return null
  const stops = drafts.serviceDraft?.stops ?? []
  const alongLine = preview.value.chainage_order
    .map((i) => stops[i]?.name)
    .filter((n): n is string => !!n)
  return `Authored order doesn't match the route's direction. Along the line: ${alongLine.join(' → ')}.`
})

function handleAddStop(): void {
  if (!drafts.serviceDraft) return
  if (!newStopName.value.trim() || newStopLat.value === null || newStopLng.value === null) return
  drafts.addStop({ name: newStopName.value.trim(), lat: newStopLat.value, lng: newStopLng.value, seq: 0 })
  newStopName.value = ''
  newStopLat.value = null
  newStopLng.value = null
}

function handleAddFrequencyWindow(): void {
  if (newWindowHeadwayMin.value === null || newWindowHeadwayMin.value <= 0) return
  drafts.addFrequencyWindow({
    start_time: newWindowStart.value,
    end_time: newWindowEnd.value,
    headway_s: Math.round(newWindowHeadwayMin.value * 60),
  })
  newWindowHeadwayMin.value = null
}

const canSubmit = computed(() => {
  const draft = drafts.serviceDraft
  if (!draft || submitting.value) return false
  if (!draft.route_slug || !draft.name.trim()) return false
  if (draft.stops.length < 2) return false
  if (draft.vehicle.max_speed_kmh <= 0 || draft.vehicle.acceleration_ms2 <= 0 || draft.vehicle.deceleration_ms2 <= 0) {
    return false
  }
  if (draft.frequency_windows.length === 0) return false
  if (preview.value) {
    if (preview.value.stops.some((s) => s.off_route)) return false
    if (!preview.value.order_is_consistent) return false
  }
  return true
})

async function handleSubmit(): Promise<void> {
  const draft = drafts.serviceDraft
  if (!draft || !canSubmit.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const created = await createService(draft)
    drafts.clearServiceDraft()
    submitted.value = true
    await triggerCompile(created.slug)
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Something went wrong creating the service.'
  } finally {
    submitting.value = false
  }
}

// A 409 with the stale-graph code is not an error to show the user (SPA-83
// decision 4): it means a compiled graph fell behind an edit, so the fix is to
// fire the compile again and retry, not to surface a failure.
async function triggerCompile(slug: string): Promise<void> {
  compiling.value = true
  compileError.value = ''
  try {
    const job = await compileService(slug)
    const finished = await jobs.track(job.id)
    compiledGraph.value = finished.result ?? null
  } catch (err) {
    if (err instanceof ApiError && err.code === 'stale_graph') {
      await triggerCompile(slug)
      return
    }
    compileError.value = err instanceof Error ? err.message : 'Compile failed.'
  } finally {
    compiling.value = false
  }
}

function startAnother(): void {
  submitted.value = false
  compiledGraph.value = null
  compileError.value = ''
  preview.value = null
  selectedRoute.value = null
  drafts.startServiceDraft()
}

const allEdges = computed<GraphEdge[]>(() => compiledGraph.value?.services.flatMap((s) => s.edges) ?? [])

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <h1 class="font-display text-display text-ink-true">
      New service
    </h1>

    <template v-if="!submitted">
      <div class="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_1fr]">
        <form
          class="flex flex-col gap-6"
          @submit.prevent="handleSubmit"
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
                v-model="routeSlug"
                :class="FIELD_INPUT_CLASS"
                data-testid="route-select"
                @change="handleRouteChange"
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
          </section>

          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <h2 class="font-display text-h3 text-ink-true">
              Stops
            </h2>

            <ul
              v-if="drafts.serviceDraft?.stops.length"
              class="mt-3 flex flex-col gap-2"
              data-testid="stops-list"
            >
              <li
                v-for="(stop, index) in drafts.serviceDraft.stops"
                :key="index"
                class="font-body text-caption flex items-center justify-between gap-2 rounded-(--radius-field) border border-border bg-white px-3 py-2 text-ink"
                data-testid="stop-row"
              >
                <div>
                  <span class="font-medium">{{ stop.name }}</span>
                  <span class="text-ink-muted"> ({{ stop.lat.toFixed(4) }}, {{ stop.lng.toFixed(4) }})</span>
                  <span
                    v-if="preview?.stops[index]?.off_route"
                    class="ml-2 text-coral"
                    data-testid="stop-off-route"
                  >
                    {{ Math.round(preview!.stops[index].offset_m) }}m off the route
                  </span>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button
                    type="button"
                    class="cursor-pointer px-1 text-ink-muted hover:text-ink"
                    :data-testid="`stop-up-${index}`"
                    :disabled="index === 0"
                    @click="drafts.moveStop(index, -1)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer px-1 text-ink-muted hover:text-ink"
                    :data-testid="`stop-down-${index}`"
                    :disabled="index === drafts.serviceDraft.stops.length - 1"
                    @click="drafts.moveStop(index, 1)"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer px-1 text-ink-muted hover:text-coral"
                    :data-testid="`stop-remove-${index}`"
                    @click="drafts.removeStop(index)"
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

            <div class="mt-3 grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
              <label :class="FIELD_LABEL_CLASS">
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
                class="font-display text-btn mt-auto cursor-pointer rounded-(--radius-field) border border-border px-3 py-1.5 uppercase hover:bg-white"
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
              v-if="drafts.serviceDraft?.frequency_windows.length"
              class="mt-3 flex flex-col gap-2"
              data-testid="frequency-list"
            >
              <li
                v-for="(window, index) in drafts.serviceDraft.frequency_windows"
                :key="index"
                class="font-body text-caption flex items-center justify-between gap-2 rounded-(--radius-field) border border-border bg-white px-3 py-2 text-ink"
              >
                <span>{{ window.start_time }}–{{ window.end_time }}, every {{ Math.round(window.headway_s / 60) }} min</span>
                <button
                  type="button"
                  class="cursor-pointer px-1 text-ink-muted hover:text-coral"
                  :data-testid="`frequency-remove-${index}`"
                  @click="drafts.removeFrequencyWindow(index)"
                >
                  ✕
                </button>
              </li>
            </ul>

            <div class="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
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
                class="font-display text-btn mt-auto cursor-pointer rounded-(--radius-field) border border-border px-3 py-1.5 uppercase hover:bg-white"
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

          <button
            type="submit"
            class="font-display text-btn cursor-pointer rounded-(--radius-field) bg-coral px-4 py-2.5 text-white uppercase transition-colors duration-200 ease-(--ease-smooth) hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-coral"
            data-testid="submit"
            :disabled="!canSubmit"
          >
            {{ submitting ? 'Creating…' : 'Create service' }}
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

        <div class="h-[70vh] overflow-hidden rounded-(--radius-box) border border-border">
          <MapView
            :loading="false"
            :isochrone-data="null"
            :routes="mapRoutes"
            :stations="[]"
            :services="[]"
            :stop-preview-pairs="stopPreviewPairs"
            hide-isochrone-legend
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
          Service created. Compiling…
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
          v-else-if="compiledGraph"
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
                <td>{{ formatSeconds(edge.seconds) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          type="button"
          class="font-display text-btn mt-4 cursor-pointer rounded-(--radius-field) border border-border px-3 py-1.5 uppercase hover:bg-white"
          data-testid="start-another"
          @click="startAnother"
        >
          Author another service
        </button>
      </div>
    </template>
  </main>
</template>
