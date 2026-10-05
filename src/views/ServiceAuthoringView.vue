<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from '../composables/useConfirm'
import { usePageTitle } from '../composables/usePageTitle'
import { useServiceDraft } from '../composables/useServiceDraft'
import { useToast } from '../composables/useToast'
import { MAX_DESCRIPTION_CHARS, MAX_SUBTEXT_CHARS, type SnapCoord as LatLng } from '../api/authoring'
import BreadcrumbTrail from '../components/BreadcrumbTrail.vue'
import { AUTHORING_CRUMB, type Crumb } from '../components/crumbs'
import MapView from '../components/MapView.vue'
import FieldSkeleton from '../components/FieldSkeleton.vue'
import LoadingRegion from '../components/LoadingRegion.vue'
import SkeletonShape from '../components/SkeletonShape.vue'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TOGGLE_BUTTON_CLASS } from '../components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'
import { ACTION_LINK_CLASS } from '../components/linkStyles'
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
  hasChanges,
  canSave,
  submitting,
  createdSlug,
  submitError,
  faultedStops,
  stopFaultMessage,
  submit,
  discardEdit,
  compiling,
  compileError,
  compiledGraph,
  start,
  dispose,
} = useServiceDraft(props.slug)

// Named after the service as saved, not the name field: the tab should not
// rename itself on every keystroke.
usePageTitle(() => (editing.value ? `Edit ${editing.value.name}` : null))

const servicePath = computed(() => `/authoring/services/${props.slug}`)

const trail = computed<Crumb[]>(() => [
  AUTHORING_CRUMB,
  ...(props.slug
    ? [{ label: editing.value?.name ?? 'Service', to: servicePath.value }, { label: 'Edit' }]
    : [{ label: 'New service' }]),
])

const SUBHEADING_CLASS = 'font-body text-caption font-bold text-ink'

const submitLabel = computed(() => (props.slug ? 'Save changes' : 'Create service'))

// Held from the save until the page is left, including the moment between a
// recompile landing and the navigation it starts.
const locked = computed(() => submitting.value || compiling.value || !!compiledGraph.value)

type SaveTone = 'quiet' | 'dirty' | 'busy' | 'error'

const TONE_DOT_CLASS: Record<SaveTone, string> = {
  quiet: 'bg-ink-faint',
  dirty: 'bg-apricot',
  busy: 'animate-pulse bg-coral',
  error: 'bg-error',
}

// Described against the saved service, never against the copy in the browser,
// which is kept on every keystroke and so is never behind. A failed recompile
// is shown on its own, with the way back, until the author changes something.
const saveStatus = computed<{ label: string; note?: string; tone: SaveTone }>(() => {
  if (submitting.value) return { label: props.slug ? 'Saving…' : 'Creating…', tone: 'busy' }
  if (compiling.value || compiledGraph.value) return { label: 'Compiling…', tone: 'busy' }
  if (submitError.value) {
    return { label: "Couldn't save", note: 'Your draft is still kept in this browser', tone: 'error' }
  }
  if (hasChanges.value) {
    return { label: props.slug ? 'Unsaved changes' : 'Not created yet', note: 'Draft kept in this browser', tone: 'dirty' }
  }
  return { label: props.slug ? 'No changes' : 'Nothing here yet', tone: 'quiet' }
})

const compileFailed = computed(() => !!compileError.value && !submitting.value && !compiling.value && !hasChanges.value)

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

const stopsSection = ref<HTMLElement | null>(null)

const { confirm } = useConfirm()
const { show: toast } = useToast()

async function handleRemoveStop(index: number): Promise<void> {
  const stop = stops.value[index]
  if (!stop) return
  const confirmed = await confirm({
    title: 'Remove this stop?',
    body: `${stop.name || 'This stop'} comes off the route, and this can't be undone.`,
    confirmLabel: 'Remove stop',
    cancelLabel: 'Keep stop',
    destructive: true,
  })
  // The list may have changed under the open dialog; remove the stop that was
  // asked about, not whatever now sits at its old index.
  const at = stops.value.findIndex((s) => s.id === stop.id)
  if (!confirmed || at === -1) return
  removeStop(at)
  toast('Stop removed')
  // The remove button that had focus went with its row; carry focus to the
  // stop that took its place, or the one before, or the new-stop name.
  await nextTick()
  const next = Math.min(at, stops.value.length - 1)
  const target = next >= 0 ? `[data-testid="stop-remove-${next}"]` : '[data-testid="stop-name"]'
  stopsSection.value?.querySelector<HTMLElement>(target)?.focus()
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
  if (hasChanges.value) {
    const confirmed = await confirm({
      title: 'Discard your changes?',
      body: 'The service stays as it was last saved, and this can\'t be undone.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      destructive: true,
    })
    if (!confirmed) return
  }
  discardEdit()
  await router.push(servicePath.value)
}

// An edit ends on the page of the service it saved over, but only once the
// recompile has landed: that page reads the latest compile that succeeded, so
// arriving any sooner would show the graph from before the edit. Replaced
// rather than pushed, so going back does not reopen a finished edit.
watch(compiledGraph, (graph) => {
  if (!graph || !props.slug) return
  toast('Changes saved')
  void router.replace(servicePath.value)
})

// A create ends on the new service's page straight away, which compiles it on
// arrival. Replaced for the same reason as an edit: going back should not
// reopen a form whose draft has already become a service.
watch(createdSlug, (created) => {
  if (!created) return
  toast('Service created')
  void router.replace(`/authoring/services/${created}`)
})
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <BreadcrumbTrail :items="trail" />
    <h1 class="mt-8 font-display text-display text-ink-true">
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

    <LoadingRegion
      v-else-if="!ready"
      :label="slug ? 'Loading service' : 'Loading'"
      class="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_1fr]"
      data-testid="draft-loading"
    >
      <div class="flex flex-col gap-6">
        <SkeletonShape
          shape="card"
          :lines="2"
        />
        <SkeletonShape
          shape="card"
          :lines="4"
        />
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton :rows="5" />
      </div>
      <SkeletonShape
        shape="block"
        class="h-[70vh] min-h-[70vh]"
        data-testid="map-panel-skeleton"
      />
    </LoadingRegion>

    <!--
      Not items-start: the map column has to stretch to the row's height for
      the map inside it to have anywhere to stick.
    -->
    <div
      v-else
      class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr]"
    >
      <!--
        Below lg the form dissolves into the grid so the save bar can go last,
        after the map, and stay stuck for the whole page rather than only while
        the form is in view.
      -->
      <form
        class="flex flex-col gap-6 max-lg:contents"
        @submit.prevent="submit"
      >
        <fieldset
          class="flex min-w-0 flex-col gap-6"
          :disabled="locked"
          data-testid="form-body"
        >
          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <h2 class="font-display text-h3 text-ink-true">
              Identity
            </h2>
            <div class="mt-3 flex flex-col gap-3">
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
            </div>
          </section>

          <section
            ref="stopsSection"
            class="rounded-(--radius-box) border border-border bg-surface p-4"
          >
            <h2 class="font-display text-h3 text-ink-true">
              Route &amp; stops
            </h2>
            <LoadingRegion
              v-if="routesLoading"
              label="Loading routes"
              class="mt-3"
              data-testid="routes-loading"
            >
              <FieldSkeleton />
            </LoadingRegion>
            <p
              v-else-if="routesError"
              class="font-body text-caption mt-3 text-error"
              role="alert"
              data-testid="routes-error"
            >
              Couldn't load routes.
            </p>
            <label
              v-else
              :class="[FIELD_LABEL_CLASS, 'mt-3']"
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
              class="font-body text-caption mt-2 text-error"
              role="alert"
              data-testid="route-missing"
            >
              Couldn't recover this service's route. Pick it again to save.
            </p>

            <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p :class="FIELD_LABEL_CLASS">
                Stops
              </p>
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
                :key="stop.id"
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
                    class="text-error"
                    data-testid="stop-off-route"
                  >
                    {{ Math.round(preview!.stops[index].offset_m) }}m off the route
                  </span>
                  <span
                    v-if="faultedStops.has(stop.seq)"
                    class="text-error"
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
                    @click="handleRemoveStop(index)"
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
              class="font-body text-caption mt-2 text-error"
              role="alert"
              data-testid="preview-error"
            >
              Couldn't preview the snap. You can still add stops.
            </p>
            <p
              v-if="orderWarning"
              class="font-body text-caption mt-2 text-error"
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
              Operations
            </h2>

            <h3 :class="[SUBHEADING_CLASS, 'mt-3']">
              Vehicle
            </h3>
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

            <h3 :class="[SUBHEADING_CLASS, 'mt-5']">
              Frequency windows
            </h3>
            <ul
              v-if="frequencyWindows.length"
              class="mt-2 flex flex-col gap-2"
              data-testid="frequency-list"
            >
              <li
                v-for="(window, index) in frequencyWindows"
                :key="window.id"
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

          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <h2 class="font-display text-h3 text-ink-true">
              Description
              <span class="font-body text-caption font-normal text-ink-muted">optional</span>
            </h2>
            <label :class="[FIELD_LABEL_CLASS, 'mt-3']">
              <span class="sr-only">Description</span>
              <textarea
                v-model="description"
                :class="FIELD_INPUT_CLASS"
                data-testid="service-description"
                rows="5"
                :maxlength="MAX_DESCRIPTION_CHARS"
              />
            </label>
          </section>
        </fieldset>

        <div
          class="sticky bottom-0 z-20 flex max-lg:order-last flex-col gap-2 rounded-t-(--radius-box) border border-b-0 border-border bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/6%)] backdrop-blur"
          data-testid="save-bar"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div
              v-if="compileFailed"
              class="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <p
                class="font-body text-caption flex items-center gap-2 text-error"
                role="alert"
                data-testid="compile-error"
              >
                <span
                  class="size-2 shrink-0 rounded-full bg-error"
                  aria-hidden="true"
                />
                Saved, but compiling failed: {{ compileError }}
              </p>
              <router-link
                :to="servicePath"
                :class="ACTION_LINK_CLASS"
                data-testid="view-service"
              >
                View service
              </router-link>
            </div>
            <p
              v-else
              class="font-body text-caption flex items-center gap-2 text-ink"
              role="status"
              data-testid="save-status"
            >
              <span
                class="size-2 shrink-0 rounded-full"
                :class="TONE_DOT_CLASS[saveStatus.tone]"
                aria-hidden="true"
              />
              {{ saveStatus.label }}<span
                v-if="saveStatus.note"
                class="text-ink-muted"
              > · {{ saveStatus.note }}</span>
            </p>

            <div class="ml-auto flex items-center gap-4">
              <button
                v-if="slug"
                type="button"
                :class="ACTION_LINK_CLASS"
                data-testid="discard-edit"
                :disabled="locked"
                @click="handleDiscard"
              >
                Discard changes
              </button>
              <button
                type="submit"
                :class="PRIMARY_BUTTON_CLASS"
                data-testid="submit"
                :disabled="!canSave || locked"
              >
                {{ submitLabel }}
              </button>
            </div>
          </div>

          <p
            v-if="submitError"
            class="font-body text-caption text-error"
            role="alert"
            data-testid="submit-error"
          >
            {{ submitError }}
          </p>
        </div>
      </form>

      <!-- Below lg the map simply follows the form; its mobile layout is M5's. -->
      <div class="h-[70vh] lg:h-auto">
        <div class="h-full lg:sticky lg:top-4 lg:h-[calc(100svh-2rem)]">
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
    </div>
  </main>
</template>
