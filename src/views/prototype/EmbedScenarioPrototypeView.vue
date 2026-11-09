<script setup lang="ts">
// PROTOTYPE (SPA-462): three variants of the embeddable splash-zone map on
// /embed/scenario/:slug, switchable via ?variant=static|strip|panel.
//   static — caption bar + map, plots only what the URL says, example chips
//            when nothing is plotted.
//   strip  — static plus a 56px bottom control strip (pick on map, mode,
//            budget, Plot). Collapses to one floating button under 480px.
//   panel  — the real IsochroneForm in a side panel, as the site does today.
// Throwaway: no tests, minimal error handling.
import { computed, ref, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'
import MapView from '../../components/MapView.vue'
import IsochroneForm from '../../IsochroneForm.vue'
import PrerenderedIsochrones from '../../components/PrerenderedIsochrones.vue'
import PrototypeSwitcher from '../../components/prototype/PrototypeSwitcher.vue'
import { PLOT_WITHOUT_MAP } from '../../components/mapLoad'
import { ORIGIN_PICK_CUE } from '../../components/placementCues'
import { PRIMARY_BUTTON_CLASS, SELECTED_CHOICE_CLASS } from '../../components/buttonStyles'
import { FIELD_INPUT_CLASS } from '../../components/fieldStyles'
import { isochroneWaitMessage } from '../../api/isochroneFault'
import { useScenario } from '../../composables/useScenario'
import { useIsochrone } from '../../composables/useIsochrone'
import { useIsochroneQuery } from '../../composables/useIsochroneQuery'
import { DEFAULT_DURATION, DEFAULT_MODE, DURATION_OPTIONS, type IsochronePayload } from '../../isochroneQuery'
import { TRAVEL_MODES, type TravelMode } from '../../api/authoring/types'
import { MODE_LABELS, MODE_TRIPS } from '../../copy/modes'
import type { PrerenderedIsochrone } from '../../api/prerenderedIsochrones'
import type { SnapCoord as LatLng } from '../../api/authoring/types'

const props = defineProps<{ slug: string }>()

const VARIANTS = [
  { key: 'static', name: 'Static, no controls' },
  { key: 'strip', name: 'Bottom control strip' },
  { key: 'panel', name: 'Side panel, real form' },
]

const route = useRoute()
const variant = computed(() => {
  const v = route.query.variant
  return typeof v === 'string' && VARIANTS.some((x) => x.key === v) ? v : 'static'
})

const { name, subtext, routes, stations, loading: scenarioLoading } = useScenario(props.slug)

const {
  data: isochroneData,
  loading: isLoading,
  error: fetchError,
  progress: isochroneProgress,
  generate,
  show: showIsochrone,
} = useIsochrone(() => stations.value)

const origin = ref<LatLng | null>(null)
const plotted = ref<IsochronePayload | null>(null)

async function plot(payload: IsochronePayload): Promise<void> {
  selectedPrerenderedId.value = null
  origin.value = { lat: payload.lat, lng: payload.lng }
  plotted.value = payload
  await generate({
    lat: payload.lat,
    lng: payload.lng,
    budget_mins: payload.duration,
    mode: payload.mode,
    scenario_slug: props.slug,
  })
}

const { initial: linkedIsochrone, submit: submitIsochrone, forget: forgetIsochrone } = useIsochroneQuery({
  plot,
  plotted: () => isochroneData.value !== null && fetchError.value === null,
  ready: () => stations.value.length > 0,
})

// --- Examples (prerendered, free) -------------------------------------------
const selectedPrerenderedId = ref<string | null>(null)
const hasExamples = ref<boolean | null>(null)

function onPrerenderedSelect(entry: PrerenderedIsochrone): void {
  showIsochrone(entry.result)
  void forgetIsochrone()
  origin.value = { lat: entry.lat, lng: entry.lng }
  const mode = TRAVEL_MODES.find((m): m is TravelMode => m === entry.mode) ?? DEFAULT_MODE
  plotted.value = { lat: entry.lat, lng: entry.lng, mode, duration: entry.budget_mins }
  stripMode.value = mode
  stripDuration.value = entry.budget_mins
  isochroneForm.value?.fill(plotted.value)
}

const showExamples = computed(() => isochroneData.value === null && !isLoading.value && hasExamples.value === true)

// --- Strip variant state ----------------------------------------------------
const pickArmed = ref(false)
const sheetOpen = ref(false)
const stripMode = ref<TravelMode>(linkedIsochrone.mode ?? DEFAULT_MODE)
const stripDuration = ref<number>(linkedIsochrone.duration ?? DEFAULT_DURATION)
const stripOrigin = ref<LatLng | null>(
  linkedIsochrone.lat !== undefined && linkedIsochrone.lng !== undefined
    ? { lat: linkedIsochrone.lat, lng: linkedIsochrone.lng }
    : null,
)

const isochroneForm = useTemplateRef<InstanceType<typeof IsochroneForm>>('isochroneForm')

function onMapClick(coord: LatLng): void {
  if (variant.value === 'panel') {
    isochroneForm.value?.setOriginFromMap(coord)
    return
  }
  if (variant.value === 'strip' && pickArmed.value) {
    stripOrigin.value = coord
    origin.value = coord
    pickArmed.value = false
  }
}

async function plotFromStrip(): Promise<void> {
  if (!stripOrigin.value) return
  sheetOpen.value = false
  await submitIsochrone({
    lat: stripOrigin.value.lat,
    lng: stripOrigin.value.lng,
    mode: stripMode.value,
    duration: stripDuration.value,
  })
}

const stripSubmitLabel = computed(() => (isLoading.value ? 'Plotting…' : 'Plot'))

// --- Caption ----------------------------------------------------------------
const caption = computed(() => {
  if (isLoading.value) return 'Plotting…'
  if (plotted.value && isochroneData.value) {
    return `${plotted.value.duration} min ${MODE_TRIPS[plotted.value.mode]} from the pin`
  }
  if (pickArmed.value) return ORIGIN_PICK_CUE
  return subtext.value
})

const openHref = computed(() => {
  const url = new URL(`/scenario/${props.slug}`, window.location.origin)
  for (const key of ['at', 'mode', 'mins']) {
    const v = route.query[key]
    if (typeof v === 'string') url.searchParams.set(key, v)
  }
  return url.toString()
})

// The same emoji the real form uses for its mode tiles.
const MODE_ICONS: Record<TravelMode, string> = { walk: '🚶', bike: '🚲', drive: '🚗', transit: '🚆' }
const MODE_PILLS = TRAVEL_MODES.map((value) => ({ value, label: MODE_LABELS[value], icon: MODE_ICONS[value] }))
const PILL_IDLE = 'border-border bg-white text-ink-muted hover:border-ink-faint'
</script>

<template>
  <div
    class="@container relative flex h-svh flex-col overflow-hidden bg-white text-ink"
    data-testid="embed-root"
  >
    <!-- Caption bar -->
    <header class="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
      <div class="flex min-w-0 flex-1 flex-col leading-tight">
        <span class="t-subhead block max-w-full truncate text-ink-true">{{ scenarioLoading ? 'Loading…' : name }}</span>
        <span class="t-meta block max-w-full truncate text-ink-muted">{{ caption }}</span>
      </div>
      <a
        :href="openHref"
        target="_blank"
        rel="noopener"
        class="font-display text-btn flex shrink-0 items-center gap-1.5 rounded-(--radius-field) border border-border px-2.5 py-1.5 uppercase hover:bg-surface"
      >
        <span class="@max-[480px]:hidden">Open on Sparks Effect</span>
        <span class="hidden @max-[480px]:inline">Open</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          class="size-3 fill-none stroke-current stroke-[2.5]"
        ><path d="M7 17 17 7M8 7h9v9" /></svg>
      </a>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- panel variant: the real form beside the map -->
      <aside
        v-if="variant === 'panel'"
        class="flex w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-3 @max-[560px]:hidden"
      >
        <IsochroneForm
          ref="isochroneForm"
          :error="fetchError"
          :loading="isLoading"
          :initial="linkedIsochrone"
          :framed="false"
          @submit="submitIsochrone"
          @origin-change="origin = $event"
          @pick-armed="pickArmed = $event"
        />
        <div
          v-show="hasExamples"
          class="flex flex-col gap-1.5"
        >
          <span class="t-eyebrow text-ink-muted">Or try an example</span>
          <PrerenderedIsochrones
            v-model:selected-id="selectedPrerenderedId"
            :slug="props.slug"
            @select="onPrerenderedSelect"
            @available="hasExamples = $event"
          />
        </div>
      </aside>

      <div class="relative min-w-0 flex-1">
        <MapView
          label="Splash zone map"
          :without-map="PLOT_WITHOUT_MAP"
          flush
          hide-isochrone-legend
          :origin="origin"
          :isochrone-data="isochroneData"
          :loading="isLoading"
          :loading-message="isochroneWaitMessage(isochroneProgress)"
          :routes="routes"
          :stations="stations"
          :placement-armed="pickArmed"
          :placement-cue="ORIGIN_PICK_CUE"
          @map-click="onMapClick"
        />

        <!-- Example chips, when nothing is plotted (static + strip) -->
        <div
          v-if="variant !== 'panel'"
          v-show="showExamples && !pickArmed"
          class="absolute inset-x-2.5 bottom-8 z-1 flex flex-col gap-1.5 rounded-(--radius-box) border border-border bg-white/95 p-2.5 shadow-(--shadow-panel) [&_li]:w-44 [&_li]:shrink-0 [&_ul]:flex [&_ul]:gap-1.5 [&_ul]:overflow-x-auto [&_ul]:pb-0.5"
          data-testid="embed-examples"
        >
          <span class="t-eyebrow text-ink-muted">See what this line reaches</span>
          <PrerenderedIsochrones
            v-model:selected-id="selectedPrerenderedId"
            :slug="props.slug"
            @select="onPrerenderedSelect"
            @available="hasExamples = $event"
          />
        </div>

        <!-- strip variant, narrow: floating button + sheet -->
        <template v-if="variant === 'strip'">
          <button
            v-if="!sheetOpen"
            type="button"
            :class="[PRIMARY_BUTTON_CLASS, 'absolute bottom-8 left-2.5 z-2 hidden items-center gap-2 shadow-(--shadow-panel) @max-[480px]:flex']"
            @click="sheetOpen = true"
          >
            Plot your own
          </button>
          <form
            v-if="sheetOpen"
            class="absolute inset-x-0 bottom-0 z-2 hidden flex-col gap-2 border-t border-border bg-white p-2.5 shadow-(--shadow-bar) @max-[480px]:flex"
            @submit.prevent="plotFromStrip"
          >
            <div class="flex items-center justify-between">
              <span class="t-eyebrow text-ink-muted">Plot a splash zone</span>
              <button
                type="button"
                class="t-meta cursor-pointer px-2 py-1 text-ink-muted"
                aria-label="Close"
                @click="sheetOpen = false"
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              class="font-display text-btn flex h-9 cursor-pointer items-center justify-center gap-2 rounded-(--radius-field) border uppercase"
              :class="pickArmed ? SELECTED_CHOICE_CLASS : PILL_IDLE"
              :aria-pressed="pickArmed"
              @click="pickArmed = !pickArmed; if (pickArmed) sheetOpen = false"
            >
              {{ stripOrigin ? 'Move the starting point' : 'Tap the map to set a start' }}
            </button>
            <div class="flex gap-1.5">
              <div
                role="group"
                aria-label="Travel mode"
                class="flex min-w-0 flex-1 gap-1"
              >
                <button
                  v-for="pill in MODE_PILLS"
                  :key="pill.value"
                  type="button"
                  class="flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-(--radius-field) border"
                  :class="stripMode === pill.value ? SELECTED_CHOICE_CLASS : PILL_IDLE"
                  :aria-pressed="stripMode === pill.value"
                  :title="pill.label"
                  @click="stripMode = pill.value"
                >
                  <span
                    aria-hidden="true"
                    class="text-lg leading-none"
                  >{{ pill.icon }}</span>
                  <span class="sr-only">{{ pill.label }}</span>
                </button>
              </div>
              <select
                v-model.number="stripDuration"
                aria-label="Travel time budget"
                :class="[FIELD_INPUT_CLASS, 'h-9 shrink-0']"
              >
                <option
                  v-for="d in DURATION_OPTIONS"
                  :key="d"
                  :value="d"
                >
                  {{ d }} min
                </option>
              </select>
              <button
                type="submit"
                :class="[PRIMARY_BUTTON_CLASS, 'h-9 shrink-0 py-0']"
                :disabled="!stripOrigin || isLoading"
              >
                {{ stripSubmitLabel }}
              </button>
            </div>
          </form>
        </template>
      </div>
    </div>

    <!-- strip variant, wide: the bottom strip -->
    <form
      v-if="variant === 'strip'"
      class="flex h-14 shrink-0 items-center gap-2.5 border-t border-border bg-surface px-3 @max-[480px]:hidden"
      data-testid="embed-strip"
      @submit.prevent="plotFromStrip"
    >
      <button
        type="button"
        class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-field) border"
        :class="pickArmed ? SELECTED_CHOICE_CLASS : PILL_IDLE"
        aria-label="Pick the starting point on the map"
        title="Pick on the map"
        :aria-pressed="pickArmed"
        @click="pickArmed = !pickArmed"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          class="size-[18px] fill-none stroke-current stroke-2"
        ><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle
          cx="12"
          cy="10"
          r="3"
        /></svg>
      </button>
      <span
        v-if="!stripOrigin"
        class="t-meta min-w-0 flex-1 truncate text-ink-muted"
      >
        {{ pickArmed ? ORIGIN_PICK_CUE : 'Pick a starting point on the map' }}
      </span>
      <div
        role="group"
        aria-label="Travel mode"
        class="flex min-w-0 gap-1"
        :class="stripOrigin ? 'flex-1' : 'shrink-0'"
      >
        <button
          v-for="pill in MODE_PILLS"
          :key="pill.value"
          type="button"
          class="font-display text-btn h-9 cursor-pointer rounded-(--radius-field) border px-2.5 uppercase"
          :class="[stripMode === pill.value ? SELECTED_CHOICE_CLASS : PILL_IDLE, stripOrigin ? 'min-w-0 flex-1 truncate' : '']"
          :aria-pressed="stripMode === pill.value"
          @click="stripMode = pill.value"
        >
          {{ pill.label }}
        </button>
      </div>
      <select
        v-model.number="stripDuration"
        aria-label="Travel time budget"
        :class="[FIELD_INPUT_CLASS, 'h-9 shrink-0']"
      >
        <option
          v-for="d in DURATION_OPTIONS"
          :key="d"
          :value="d"
        >
          {{ d }} min
        </option>
      </select>
      <button
        type="submit"
        :class="[PRIMARY_BUTTON_CLASS, 'h-9 shrink-0 py-0']"
        :disabled="!stripOrigin || isLoading"
      >
        {{ stripSubmitLabel }}
      </button>
    </form>

    <p
      v-if="fetchError"
      class="t-error absolute inset-x-3 top-13 z-2 rounded-(--radius-field) bg-white/95 px-3 py-2 shadow-(--shadow-panel)"
      role="alert"
    >
      {{ fetchError }}
    </p>

    <PrototypeSwitcher :variants="VARIANTS" />
  </div>
</template>
