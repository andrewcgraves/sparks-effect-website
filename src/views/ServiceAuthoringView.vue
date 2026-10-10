<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from '../composables/useConfirm'
import { usePageTitle } from '../composables/usePageTitle'
import { useServiceDraft } from '../composables/useServiceDraft'
import { useToast } from '../composables/useToast'
import type { DraftStop } from '../stores/drafts'
import { MAX_DESCRIPTION_CHARS, MAX_SUBTEXT_CHARS, type SnapCoord as LatLng } from '../api/authoring'
import BreadcrumbTrail from '../components/BreadcrumbTrail.vue'
import { AUTHORING_CRUMB, type Crumb } from '../components/crumbs'
import MapView from '../components/MapView.vue'
import FieldSkeleton from '../components/FieldSkeleton.vue'
import LoadingRegion from '../components/LoadingRegion.vue'
import SkeletonShape from '../components/SkeletonShape.vue'
import StopActionsMenu from '../components/StopActionsMenu.vue'
import VehicleFields from '../components/VehicleFields.vue'
import { PLACEMENT_TOGGLE_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from '../components/buttonStyles'
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
  vehicle,
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
  moveStopTo,
  putInRouteOrder,
  reverseStops,
  canPutInRouteOrder,
  dragStop,
  dropStop,
  addFrequencyWindow,
  removeFrequencyWindow,
  previewLoading,
  previewError,
  stopSnaps,
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
    ? [{ label: editing.value?.name ?? 'Line', to: servicePath.value }, { label: 'Edit' }]
    : [{ label: 'New line' }]),
])

const SUBHEADING_CLASS = 'font-body text-caption font-bold text-ink'

const submitLabel = computed(() => (props.slug ? 'Save changes' : 'Create line'))

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

const COORDINATE_LIMITS = { lat: 90, lng: 180 } as const

// A cleared number field reaches its model as '' rather than null, and Number('')
// is 0, which would put the stop in the Gulf of Guinea.
function isCoordinate(field: 'lat' | 'lng', value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= COORDINATE_LIMITS[field]
}

function handleAddStop(): void {
  const lat = newStopLat.value
  const lng = newStopLng.value
  if (!isCoordinate('lat', lat) || !isCoordinate('lng', lng)) return
  addStop({ name: newStopName.value, lat, lng })
  newStopName.value = ''
  newStopLat.value = null
  newStopLng.value = null
}

const stopsSection = ref<HTMLElement | null>(null)

const { confirm } = useConfirm()
const { show: toast } = useToast()

// What every control in a row calls its stop. Two stops can share a name, and
// a stop can lose its name altogether while it is being retyped; the position
// is what keeps "Remove Fresno" naming one button and not two. Compared the
// way a listener hears them, so "Stop 2" and "stop 2" count as the same name.
const stopLabels = computed(() => {
  const named = stops.value.map((stop, index) => stop.name.trim() || `Unnamed stop ${index + 1}`)
  const counts = new Map<string, number>()
  for (const label of named) {
    const key = label.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return named.map((label, index) =>
    (counts.get(label.toLowerCase()) ?? 0) > 1 ? `${label} (stop ${index + 1})` : label,
  )
})

const selectedStopId = ref<string | null>(null)
const mapCenter = ref<LatLng | null>(null)
const hoveredStopId = ref<string | null>(null)
const editingPositionId = ref<string | null>(null)
const draggingStopId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const stopAnnouncement = ref('')

// A fresh object each time, so picking the stop the map has since been panned
// away from still brings it back.
function selectStop(stop: DraftStop): void {
  selectedStopId.value = stop.id
  mapCenter.value = { lat: stop.lat, lng: stop.lng }
}

// A click that lands in one of the row's own controls is that control's: the
// author renaming a stop or typing its latitude is not asking the map to move.
function onStopRowClick(stop: DraftStop, event: MouseEvent): void {
  if ((event.target as Element | null)?.closest('input, button, label, textarea, select')) return
  selectStop(stop)
}

// Handed through unchanged until something is selected, so the map is never
// given a new pair list — and a redraw — that differs in nothing.
const mapStopPairs = computed(() => {
  const at = stops.value.findIndex((stop) => stop.id === selectedStopId.value)
  if (at === -1) return stopPreviewPairs.value
  return stopPreviewPairs.value.map((pair, index) => (index === at ? { ...pair, selected: true } : pair))
})

// The map names pins by position, which a reorder hands to another stop while
// the pointer has not moved; held by id, the highlight stays on the stop that
// was hovered, and goes when that stop does.
function handleMapStopHover(pairId: string | null): void {
  hoveredStopId.value = pairId === null ? null : (stops.value[Number(pairId)]?.id ?? null)
}

// Cleared first so the same sentence twice in a row is still read out.
async function announce(message: string): Promise<void> {
  stopAnnouncement.value = ''
  await nextTick()
  stopAnnouncement.value = message
}

// Named without the position its label may carry, which the move has just
// made untrue.
function announceMove(stop: DraftStop, to: number): void {
  void announce(`${stop.name.trim() || 'Unnamed stop'} is now stop ${to + 1} of ${stops.value.length}`)
}

function handleMoveStop(index: number, direction: -1 | 1): void {
  const stop = stops.value[index]
  if (!stop) return
  moveStop(index, direction)
  announceMove(stop, index + direction)
}

const orderWarningId = useId()
const routeOrderHintId = useId()

// Said only while the button cannot be used, which is most of the time. Kept
// hidden, since it is the button's description and not a line of the page.
const routeOrderHint = computed(() => {
  if (canPutInRouteOrder.value) return ''
  return orderWarning.value
    ? 'Available again once the check against the route has caught up with your changes.'
    : 'Available when the check against the route finds the stops out of order.'
})

const routeOrderDescription = computed(() => {
  const ids = [orderWarning.value ? orderWarningId : null, routeOrderHint.value ? routeOrderHintId : null]
  return ids.filter(Boolean).join(' ') || undefined
})

// aria-disabled rather than disabled: a button that disables itself under the
// pointer or the keyboard that pressed it throws focus back to the page.
function handlePutInRouteOrder(): void {
  if (!canPutInRouteOrder.value) return
  putInRouteOrder()
  void announce('Stops put in route order')
}

function handleReverseStops(): void {
  reverseStops()
  void announce('Stop order reversed')
}

async function togglePositionEditor(stop: DraftStop, index: number): Promise<void> {
  if (editingPositionId.value === stop.id) {
    editingPositionId.value = null
    return
  }
  editingPositionId.value = stop.id
  await nextTick()
  stopsSection.value?.querySelector<HTMLElement>(`[data-testid="stop-edit-lat-${index}"]`)?.focus()
}

function closePositionEditor(index: number): void {
  editingPositionId.value = null
  stopsSection.value?.querySelector<HTMLElement>(`[data-testid="stop-actions-${index}"]`)?.focus()
}

// A cleared, half-typed or out-of-range field is not a coordinate. The field is
// put back to what the stop still holds, since nothing changed for Vue to
// write it back itself.
function commitCoordinate(index: number, field: 'lat' | 'lng', event: Event): void {
  const input = event.target as HTMLInputElement
  const typed = input.value.trim()
  const value = Number(typed)
  if (typed === '' || !isCoordinate(field, value)) {
    const stop = stops.value[index]
    if (stop) input.value = String(stop[field])
    return
  }
  updateStop(index, { [field]: value })
}

const STOP_DRAG_TYPE = 'application/x-sparks-stop-id'

function onStopDragStart(stop: DraftStop, event: DragEvent): void {
  draggingStopId.value = stop.id
  const transfer = event.dataTransfer
  if (!transfer) return
  transfer.effectAllowed = 'move'
  // Firefox starts no drag that carries no data. A type of its own, rather
  // than text, so a row let go over a text field is not pasted into it.
  transfer.setData(STOP_DRAG_TYPE, stop.id)
  // The handle is what is grabbed, but the row is what is being moved.
  const row = (event.target as HTMLElement).closest('li')
  if (row) transfer.setDragImage(row, 16, 16)
}

function onStopDragOver(stop: DraftStop, event: DragEvent): void {
  if (!draggingStopId.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTargetId.value = stop.id
}

function onStopDrop(index: number, event: DragEvent): void {
  const id = draggingStopId.value
  endStopDrag()
  if (!id) return
  event.preventDefault()
  const from = stops.value.findIndex((stop) => stop.id === id)
  if (from === -1 || from === index) return
  const stop = stops.value[from]
  moveStopTo(id, index)
  announceMove(stop, index)
}

// Leaving a row for one of its own children is not leaving it; leaving it for
// a gap between rows, or for outside the list, is, and a drop there does
// nothing, so the line promising one goes.
function onStopDragLeave(stop: DraftStop, event: DragEvent): void {
  const row = event.currentTarget as Element
  if (row.contains(event.relatedTarget as Node | null)) return
  if (dropTargetId.value === stop.id) dropTargetId.value = null
}

function endStopDrag(): void {
  draggingStopId.value = null
  dropTargetId.value = null
}

// Dropped onto a row, a stop takes that row's place: the row moves down to
// make room when the stop came from below it, and up when it came from above,
// so the line is drawn on the side the stop will land.
function dropEdge(stop: DraftStop, index: number): 'before' | 'after' | null {
  if (!draggingStopId.value || dropTargetId.value !== stop.id || draggingStopId.value === stop.id) return null
  const from = stops.value.findIndex((s) => s.id === draggingStopId.value)
  return from < index ? 'after' : 'before'
}

// Hovering a pin tints the row; selecting it rings the row. Both can hold at
// once, so neither is drawn with the other's mark.
function stopRowClass(stop: DraftStop, index: number): string[] {
  const classes = [stop.id === selectedStopId.value ? 'border-coral ring-1 ring-coral' : 'border-border']
  if (stop.id === hoveredStopId.value) classes.push('bg-coral/10')
  else classes.push('bg-white')
  if (stop.id === draggingStopId.value) classes.push('opacity-50')
  const edge = dropEdge(stop, index)
  if (edge === 'before') classes.push('shadow-[0_-3px_0_var(--color-coral)]')
  if (edge === 'after') classes.push('shadow-[0_3px_0_var(--color-coral)]')
  return classes
}

async function handleRemoveStop(stopId: string): Promise<void> {
  const asked = stops.value.findIndex((s) => s.id === stopId)
  const stop = stops.value[asked]
  if (!stop) return
  const confirmed = await confirm({
    title: 'Remove this stop?',
    body: `${stopLabels.value[asked]} comes off the route, and this can't be undone.`,
    confirmLabel: 'Remove stop',
    cancelLabel: 'Keep stop',
    destructive: true,
  })
  // The list may have changed under the open dialog; remove the stop that was
  // asked about, not whatever now sits at its old index.
  const at = stops.value.findIndex((s) => s.id === stop.id)
  if (!confirmed || at === -1) return
  removeStop(at)
  if (editingPositionId.value === stop.id) editingPositionId.value = null
  if (selectedStopId.value === stop.id) selectedStopId.value = null
  toast('Stop removed')
  // The menu that had focus went with its row; carry focus to the stop that
  // took its place, or the one before, or the way to place a new one.
  await nextTick()
  const next = Math.min(at, stops.value.length - 1)
  const target = next >= 0 ? `[data-testid="stop-actions-${next}"]` : '[data-testid="toggle-place-stops"]'
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
      body: 'The line stays as it was last saved, and this can\'t be undone.',
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
  toast('Line created')
  void router.replace(`/authoring/services/${created}`)
})
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <BreadcrumbTrail :items="trail" />
    <h1 class="mt-8 font-display text-display text-ink-true">
      {{ slug ? 'Edit line' : 'New line' }}
    </h1>

    <p
      v-if="editNotFound"
      class="font-body text-body mt-3 text-ink-muted"
      data-testid="service-not-found"
    >
      No line of yours matches "{{ slug }}".
    </p>
    <p
      v-else-if="editLoadFailed"
      class="font-body text-body mt-3 text-ink-muted"
      role="alert"
      data-testid="service-error"
    >
      Failed to load this line. Please try again.
    </p>

    <LoadingRegion
      v-else-if="!ready"
      :label="slug ? 'Loading line' : 'Loading'"
      class="mt-8 flex flex-col gap-6"
      data-testid="draft-loading"
    >
      <SkeletonShape
        shape="card"
        :lines="2"
      />
      <SkeletonShape
        shape="card"
        :lines="4"
      />
      <SkeletonShape
        shape="block"
        class="h-[70vh] min-h-[70vh]"
        data-testid="map-panel-skeleton"
      />
      <FieldSkeleton />
      <FieldSkeleton />
      <FieldSkeleton :rows="5" />
    </LoadingRegion>

    <div
      v-else
      class="mt-8"
    >
      <form
        class="flex flex-col gap-6"
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
                Line name
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
              Couldn't recover this line's route. Pick it again to save.
            </p>

            <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p :class="FIELD_LABEL_CLASS">
                Stops
              </p>
              <div
                v-if="stops.length > 1"
                class="flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  :class="[SECONDARY_BUTTON_CLASS, 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent']"
                  data-testid="put-in-route-order"
                  :aria-disabled="canPutInRouteOrder ? undefined : 'true'"
                  :aria-describedby="routeOrderDescription"
                  @click="handlePutInRouteOrder"
                >
                  Put in route order
                </button>
                <button
                  type="button"
                  :class="SECONDARY_BUTTON_CLASS"
                  data-testid="reverse-stops"
                  @click="handleReverseStops"
                >
                  Reverse order
                </button>
              </div>
            </div>

            <p
              v-if="stops.length > 1 && routeOrderHint"
              :id="routeOrderHintId"
              hidden
              data-testid="route-order-hint"
            >
              {{ routeOrderHint }}
            </p>

            <p
              v-if="orderWarning"
              :id="orderWarningId"
              class="font-body text-caption mt-2 text-error"
              role="alert"
              data-testid="order-warning"
            >
              {{ orderWarning }}
            </p>

            <ol
              v-if="stops.length"
              class="mt-3 flex flex-col gap-2"
              data-testid="stops-list"
            >
              <li
                v-for="(stop, index) in stops"
                :key="stop.id"
                class="font-body text-caption rounded-(--radius-field) border px-2 py-1.5 text-ink"
                :class="stopRowClass(stop, index)"
                :aria-current="stop.id === selectedStopId ? 'true' : undefined"
                data-testid="stop-row"
                @click="onStopRowClick(stop, $event)"
                @dragover="onStopDragOver(stop, $event)"
                @dragleave="onStopDragLeave(stop, $event)"
                @drop="onStopDrop(index, $event)"
              >
                <div class="flex items-center gap-2">
                  <!--
                    Hidden from assistive tech and out of the tab order: the
                    keyboard way to reorder is Move up / Move down in the menu.
                  -->
                  <span
                    draggable="true"
                    class="cursor-grab px-0.5 text-ink-muted select-none hover:text-ink active:cursor-grabbing"
                    title="Drag to reorder"
                    aria-hidden="true"
                    :data-testid="`stop-drag-${index}`"
                    @dragstart="onStopDragStart(stop, $event)"
                    @dragend="endStopDrag"
                  >⠿</span>
                  <span
                    class="w-5 shrink-0 text-right text-ink-muted tabular-nums"
                    data-testid="stop-seq"
                  >{{ index + 1 }}</span>
                  <input
                    :value="stop.name"
                    class="min-w-0 flex-1 border-b border-transparent bg-transparent font-medium not-italic normal-case hover:border-border focus:border-ink focus-visible:outline-none"
                    :aria-label="`Rename ${stopLabels[index]}`"
                    :data-testid="`stop-edit-name-${index}`"
                    type="text"
                    @change="updateStop(index, { name: ($event.target as HTMLInputElement).value })"
                  >
                  <StopActionsMenu
                    :label="stopLabels[index]"
                    :index="index"
                    :first="index === 0"
                    :last="index === stops.length - 1"
                    :editing-position="editingPositionId === stop.id"
                    @move-up="handleMoveStop(index, -1)"
                    @move-down="handleMoveStop(index, 1)"
                    @edit-position="togglePositionEditor(stop, index)"
                    @show-on-map="selectStop(stop)"
                    @remove="handleRemoveStop(stop.id)"
                  />
                </div>
                <p
                  v-if="stopSnaps.get(stop.id)?.off_route || faultedStops.has(stop.seq)"
                  class="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-9"
                >
                  <span
                    v-if="stopSnaps.get(stop.id)?.off_route"
                    class="text-error"
                    data-testid="stop-off-route"
                  >
                    {{ Math.round(stopSnaps.get(stop.id)!.offset_m) }}m off the route
                  </span>
                  <span
                    v-if="faultedStops.has(stop.seq)"
                    class="text-error"
                    data-testid="stop-submit-error"
                  >
                    {{ stopFaultMessage(faultedStops.get(stop.seq)!) }}
                  </span>
                </p>
                <div
                  v-if="editingPositionId === stop.id"
                  class="mt-2 grid grid-cols-2 gap-2 pl-9 sm:grid-cols-[1fr_1fr_auto]"
                  :data-testid="`stop-position-${index}`"
                >
                  <label :class="FIELD_LABEL_CLASS">
                    <span>Latitude<span class="sr-only"> of {{ stopLabels[index] }}</span></span>
                    <input
                      :value="stop.lat"
                      :class="FIELD_INPUT_CLASS"
                      :data-testid="`stop-edit-lat-${index}`"
                      type="number"
                      step="any"
                      @change="commitCoordinate(index, 'lat', $event)"
                    >
                  </label>
                  <label :class="FIELD_LABEL_CLASS">
                    <span>Longitude<span class="sr-only"> of {{ stopLabels[index] }}</span></span>
                    <input
                      :value="stop.lng"
                      :class="FIELD_INPUT_CLASS"
                      :data-testid="`stop-edit-lng-${index}`"
                      type="number"
                      step="any"
                      @change="commitCoordinate(index, 'lng', $event)"
                    >
                  </label>
                  <button
                    type="button"
                    :class="[SECONDARY_BUTTON_CLASS, 'col-span-2 sm:col-span-1 sm:mt-auto']"
                    :aria-label="`Done editing position of ${stopLabels[index]}`"
                    :data-testid="`stop-position-done-${index}`"
                    @click="closePositionEditor(index)"
                  >
                    Done
                  </button>
                </div>
              </li>
            </ol>
            <p
              v-else
              class="font-body text-caption mt-3 text-ink-muted"
              data-testid="stops-empty"
            >
              No stops yet. Choose "Add stops by clicking the map" below, then click along the route.
            </p>

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

            <button
              type="button"
              :class="[PLACEMENT_TOGGLE_CLASS, 'mt-3']"
              data-testid="toggle-place-stops"
              :aria-pressed="placingStops"
              @click="placingStops = !placingStops"
            >
              Add stops by clicking the map
            </button>

            <details
              class="mt-3"
              data-testid="add-by-coordinates"
            >
              <summary class="font-body text-caption cursor-pointer text-ink-muted hover:text-ink">
                Add by coordinates
              </summary>
              <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
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
                  Latitude
                  <input
                    v-model.number="newStopLat"
                    :class="FIELD_INPUT_CLASS"
                    data-testid="stop-lat"
                    type="number"
                    step="any"
                  >
                </label>
                <label :class="FIELD_LABEL_CLASS">
                  Longitude
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
                  Add stop
                </button>
              </div>
            </details>

            <p
              class="sr-only"
              role="status"
              data-testid="stop-announcement"
            >
              {{ stopAnnouncement }}
            </p>
          </section>

          <!--
            Right under the stops it places, at every width, rather than in a
            column of its own: the map is the stops section's other half.
          -->
          <div
            class="h-[70vh]"
            data-testid="map-panel"
          >
            <MapView
              label="Stop placement map"
              :loading="false"
              :isochrone-data="null"
              :routes="mapRoutes"
              :stations="[]"
              :stop-preview-pairs="mapStopPairs"
              :placement-armed="placingStops"
              :placement-cue="STOP_PLACEMENT_CUE"
              :center-on="mapCenter"
              hide-isochrone-legend
              @map-click="addStopAt"
              @stop-drag="handleStopDrag"
              @stop-drag-end="handleStopDragEnd"
              @stop-hover="handleMapStopHover"
            />
          </div>

          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <h2 class="font-display text-h3 text-ink-true">
              Operations
            </h2>

            <h3 :class="[SUBHEADING_CLASS, 'mt-3']">
              Vehicle
            </h3>
            <VehicleFields
              v-model="vehicle"
              class="mt-2"
            />

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
                  :aria-label="`Remove the ${window.start_time}–${window.end_time} window`"
                  :data-testid="`frequency-remove-${index}`"
                  @click="removeFrequencyWindow(index)"
                >
                  <span aria-hidden="true">✕</span>
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
          class="sticky bottom-0 z-20 flex flex-col gap-2 rounded-t-(--radius-box) border border-b-0 border-border bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/6%)] backdrop-blur"
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
                View line
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
    </div>
  </main>
</template>
