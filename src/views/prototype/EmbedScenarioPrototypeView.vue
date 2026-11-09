<script setup lang="ts">
// PROTOTYPE (SPA-462): five variants of the embeddable splash-zone map on
// /embed/scenario/:slug, switchable via ?variant=static|strip|panel|overlay|wizard.
//   static  — caption bar + map, plots only what the URL says, example chips
//             when nothing is plotted.
//   strip   — static plus a 56px bottom control strip (pick on map, mode,
//             budget, Plot). Collapses to one floating button under 480px.
//   panel   — the real IsochroneForm in a side panel, as the site does today.
//   overlay — one minimizable panel floating over the map, holding the live
//             site's PlotPanel: "Plot your own" (the real form, with a typed
//             address) or "Saved splash zones" (the prerendered presets).
//   wizard  — three question boxes above the map (where from, which mode, how
//             long), "Show how far I can go!", and the five presets as buttons.
//             Collapses to a one-line summary once something is plotted.
// Throwaway: no tests, minimal error handling.
import { computed, ref, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'
import MapView from '../../components/MapView.vue'
import IsochroneForm from '../../IsochroneForm.vue'
import PlotPanel from '../../components/PlotPanel.vue'
import AddressAutocomplete from '../../components/AddressAutocomplete.vue'
import SegmentedControl from '../../components/SegmentedControl.vue'
import PrerenderedIsochrones from '../../components/PrerenderedIsochrones.vue'
import PrototypeSwitcher from '../../components/prototype/PrototypeSwitcher.vue'
import { PLOT_WITHOUT_MAP } from '../../components/mapLoad'
import { ORIGIN_PICK_CUE } from '../../components/placementCues'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, SELECTED_CHOICE_CLASS } from '../../components/buttonStyles'
import { FIELD_INPUT_CLASS } from '../../components/fieldStyles'
import { isochroneWaitMessage } from '../../api/isochroneFault'
import { useScenario } from '../../composables/useScenario'
import { useIsochrone } from '../../composables/useIsochrone'
import { useIsochroneQuery } from '../../composables/useIsochroneQuery'
import { DEFAULT_DURATION, DEFAULT_MODE, DURATION_OPTIONS, type IsochronePayload } from '../../isochroneQuery'
import { TRAVEL_MODES, type TravelMode } from '../../api/authoring/types'
import { MODE_LABELS } from '../../copy/modes'
import type { PrerenderedIsochrone } from '../../api/prerenderedIsochrones'
import type { GeocodingSuggestion } from '../../api/geocoding'
import type { SnapCoord as LatLng } from '../../api/authoring/types'

const props = defineProps<{ slug: string }>()

const VARIANTS = [
  { key: 'static', name: 'Static, no controls' },
  { key: 'strip', name: 'Bottom control strip' },
  { key: 'panel', name: 'Side panel, real form' },
  { key: 'overlay', name: 'Minimizable overlay panel' },
  { key: 'wizard', name: 'Three questions above the map' },
]

const route = useRoute()
const variant = computed(() => {
  const v = route.query.variant
  return typeof v === 'string' && VARIANTS.some((x) => x.key === v) ? v : 'static'
})

const { routes, stations } = useScenario(props.slug)

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
  if (isochroneData.value && !fetchError.value) {
    overlayOpen.value = false
    wizardOpen.value = false
  }
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
  stripOrigin.value = { lat: entry.lat, lng: entry.lng }
  originLabel.value = entry.label.replace(/\s+-\s+\d+\s*min\b.*$/, '')
  isochroneForm.value?.fill(plotted.value)
  overlayOpen.value = false
  wizardOpen.value = false
}

const showExamples = computed(() => isochroneData.value === null && !isLoading.value && hasExamples.value === true)

// --- Shared control state (strip + wizard) -----------------------------------
const pickArmed = ref(false)
const sheetOpen = ref(false)
const stripMode = ref<TravelMode>(linkedIsochrone.mode ?? DEFAULT_MODE)
const stripDuration = ref<number>(linkedIsochrone.duration ?? DEFAULT_DURATION)
const stripOrigin = ref<LatLng | null>(
  linkedIsochrone.lat !== undefined && linkedIsochrone.lng !== undefined
    ? { lat: linkedIsochrone.lat, lng: linkedIsochrone.lng }
    : null,
)
const originLabel = ref('')

const isochroneForm = useTemplateRef<InstanceType<typeof IsochroneForm>>('isochroneForm')

function onMapClick(coord: LatLng): void {
  if (variant.value === 'panel' || variant.value === 'overlay') {
    isochroneForm.value?.setOriginFromMap(coord)
    return
  }
  if (pickArmed.value) {
    stripOrigin.value = coord
    origin.value = coord
    originLabel.value = `${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`
    pickArmed.value = false
    if (variant.value === 'wizard') wizardOpen.value = true
  }
}

function onWizardAddress(suggestion: GeocodingSuggestion): void {
  stripOrigin.value = { lat: suggestion.lat, lng: suggestion.lng }
  origin.value = stripOrigin.value
  originLabel.value = suggestion.label
}

async function plotFromControls(): Promise<void> {
  if (!stripOrigin.value) return
  sheetOpen.value = false
  await submitIsochrone({
    lat: stripOrigin.value.lat,
    lng: stripOrigin.value.lng,
    mode: stripMode.value,
    duration: stripDuration.value,
  })
}

const controlsSubmitLabel = computed(() => (isLoading.value ? 'Plotting…' : 'Plot'))

// --- Overlay + wizard open state --------------------------------------------
const overlayOpen = ref(stripOrigin.value === null)
const wizardOpen = ref(stripOrigin.value === null)

const wizardSummary = computed(() => {
  if (!stripOrigin.value) return ''
  const from = originLabel.value || `${stripOrigin.value.lat.toFixed(3)}, ${stripOrigin.value.lng.toFixed(3)}`
  return `From ${from} · ${MODE_LABELS[stripMode.value]} · ${formatDuration(stripDuration.value)}`
})

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const hrs = mins / 60
  return Number.isInteger(hrs) ? `${hrs} hr${hrs === 1 ? '' : 's'}` : `${hrs} hrs`
}

// --- Site link --------------------------------------------------------------
const openHref = computed(() => {
  const url = new URL(`/scenario/${props.slug}`, window.location.origin)
  for (const key of ['at', 'mode', 'mins']) {
    const v = route.query[key]
    if (typeof v === 'string') url.searchParams.set(key, v)
  }
  return url.toString()
})

// The production host is what a reader would see; the dev server's isn't.
const openLabel = computed(() => {
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' ? 'sparks-effect.app' : host
})

// The same emoji the real form uses for its mode tiles.
const MODE_ICONS: Record<TravelMode, string> = { walk: '🚶', bike: '🚲', drive: '🚗', transit: '🚆' }
const MODE_PILLS = TRAVEL_MODES.map((value) => ({ value, label: MODE_LABELS[value], icon: MODE_ICONS[value] }))
const PILL_IDLE = 'border-border bg-white text-ink-muted hover:border-ink-faint'
const TILE_CLASS =
  'flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-(--radius-field) border py-2 transition-colors duration-200'
</script>

<template>
  <div
    class="@container relative flex h-svh flex-col overflow-hidden bg-white text-ink"
    data-testid="embed-root"
  >
    <!-- wizard variant: the three questions above the map -->
    <section
      v-if="variant === 'wizard'"
      class="shrink-0 border-b border-border bg-surface"
      data-testid="embed-wizard"
    >
      <form
        v-if="wizardOpen"
        class="flex max-h-[60cqh] flex-col gap-2.5 overflow-y-auto p-3"
        @submit.prevent="plotFromControls"
      >
        <div class="grid grid-cols-3 gap-2.5 @max-[560px]:grid-cols-1">
          <div class="flex flex-col gap-2 rounded-(--radius-box) border border-border bg-white p-2.5">
            <span class="t-subhead text-ink-true">Where are you starting from?</span>
            <AddressAutocomplete @select="onWizardAddress">
              <template #trailing>
                <button
                  type="button"
                  class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-field) border"
                  :class="pickArmed ? SELECTED_CHOICE_CLASS : PILL_IDLE"
                  aria-label="Pick the starting point on the map"
                  title="Pick on the map"
                  :aria-pressed="pickArmed"
                  @click="pickArmed = !pickArmed; if (pickArmed) wizardOpen = false"
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
              </template>
            </AddressAutocomplete>
            <span
              v-if="stripOrigin"
              class="t-meta truncate text-ink-muted"
            >
              Starting at {{ originLabel || `${stripOrigin.lat.toFixed(4)}, ${stripOrigin.lng.toFixed(4)}` }}
            </span>
          </div>

          <fieldset class="flex flex-col gap-2 rounded-(--radius-box) border border-border bg-white p-2.5">
            <legend class="sr-only">
              Mode of transportation
            </legend>
            <span class="t-subhead text-ink-true">What mode of transportation are you using at either end of your journey?</span>
            <div class="grid grid-cols-4 gap-1.5">
              <label
                v-for="pill in MODE_PILLS"
                :key="pill.value"
                :class="[TILE_CLASS, stripMode === pill.value ? SELECTED_CHOICE_CLASS : PILL_IDLE]"
              >
                <input
                  type="radio"
                  name="wizard-mode"
                  class="sr-only"
                  :value="pill.value"
                  :checked="stripMode === pill.value"
                  @change="stripMode = pill.value"
                >
                <span
                  aria-hidden="true"
                  class="text-2xl leading-none"
                >{{ pill.icon }}</span>
                <span class="t-meta">{{ pill.label }}</span>
              </label>
            </div>
          </fieldset>

          <div class="flex flex-col gap-2 rounded-(--radius-box) border border-border bg-white p-2.5">
            <span class="t-subhead text-ink-true">How much time do you have for your trip?</span>
            <SegmentedControl
              v-model="stripDuration"
              :options="DURATION_OPTIONS"
              :format-option="formatDuration"
              label="Travel time"
              name="wizard-duration"
              class="self-start"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <button
            type="submit"
            :class="PRIMARY_BUTTON_CLASS"
            :disabled="!stripOrigin || isLoading"
          >
            {{ isLoading ? 'Plotting…' : 'Show how far I can go!' }}
          </button>
          <span class="t-meta text-ink-muted">or try one of these</span>
          <div
            v-show="hasExamples"
            class="min-w-0 flex-1 [&_button]:px-2 [&_button]:py-1 [&_li]:min-w-[112px] [&_li]:flex-1 [&_ul]:flex [&_ul]:flex-wrap [&_ul]:gap-1.5"
          >
            <PrerenderedIsochrones
              v-model:selected-id="selectedPrerenderedId"
              :slug="props.slug"
              @select="onPrerenderedSelect"
              @available="hasExamples = $event"
            />
          </div>
        </div>
      </form>

      <div
        v-else
        class="flex items-center justify-between gap-3 px-3 py-2"
      >
        <span class="t-meta truncate text-ink">{{ pickArmed ? ORIGIN_PICK_CUE : wizardSummary || 'Nothing plotted yet' }}</span>
        <button
          type="button"
          :class="SECONDARY_BUTTON_CLASS"
          @click="wizardOpen = true; pickArmed = false"
        >
          Change
        </button>
      </div>
    </section>

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
        <!-- No title, no caption: the host page already says what this is.
             The way back to the site is a small URL at the bottom left,
             mirroring MapLibre's credit at the bottom right. -->
        <a
          :href="openHref"
          target="_blank"
          rel="noopener"
          class="absolute bottom-0 left-0 z-1 flex items-center gap-1 rounded-tr-(--radius-field) bg-white/80 px-1.5 text-[12px] leading-5 text-ink-muted hover:text-ink hover:underline"
          data-testid="embed-site-link"
        >
          {{ openLabel }}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            class="size-2.5 fill-none stroke-current stroke-[2.5]"
          ><path d="M7 17 17 7M8 7h9v9" /></svg>
        </a>

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

        <!-- overlay variant: the live PlotPanel floating over the map, minimizable -->
        <template v-if="variant === 'overlay'">
          <button
            v-if="!overlayOpen"
            type="button"
            :class="[PRIMARY_BUTTON_CLASS, 'absolute top-2.5 left-2.5 z-2 flex items-center gap-2 shadow-(--shadow-panel)']"
            @click="overlayOpen = true; pickArmed = false"
          >
            {{ pickArmed ? 'Click the map…' : isochroneData ? 'Plot another' : 'Plot a splash zone' }}
          </button>
          <div
            v-show="overlayOpen"
            class="absolute top-2.5 left-2.5 z-2 flex max-h-[calc(100%-44px)] w-[320px] max-w-[calc(100%-20px)] flex-col overflow-y-auto rounded-(--radius-box) shadow-(--shadow-panel) [&>section]:border-0"
            data-testid="embed-overlay"
          >
            <button
              type="button"
              class="t-meta absolute top-3 right-3 z-1 cursor-pointer rounded-(--radius-field) px-2 py-1 text-ink-muted hover:bg-white"
              aria-label="Minimize"
              @click="overlayOpen = false"
            >
              ✕
            </button>
            <PlotPanel
              :has-saved="hasExamples"
              :offline="false"
              initial-source="saved"
            >
              <template #plot>
                <IsochroneForm
                  ref="isochroneForm"
                  :error="fetchError"
                  :loading="isLoading"
                  :initial="linkedIsochrone"
                  :framed="false"
                  @submit="submitIsochrone"
                  @origin-change="origin = $event"
                  @pick-armed="pickArmed = $event; if ($event) overlayOpen = false"
                />
              </template>
              <template #saved>
                <PrerenderedIsochrones
                  v-model:selected-id="selectedPrerenderedId"
                  :slug="props.slug"
                  @select="onPrerenderedSelect"
                  @available="hasExamples = $event"
                />
              </template>
            </PlotPanel>
          </div>
        </template>

        <!-- Example chips, when nothing is plotted (static + strip) -->
        <div
          v-if="variant === 'static' || variant === 'strip'"
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
            @submit.prevent="plotFromControls"
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
                {{ controlsSubmitLabel }}
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
      @submit.prevent="plotFromControls"
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
        {{ controlsSubmitLabel }}
      </button>
    </form>

    <p
      v-if="fetchError"
      class="t-error absolute inset-x-3 bottom-3 z-2 rounded-(--radius-field) bg-white/95 px-3 py-2 shadow-(--shadow-panel)"
      role="alert"
    >
      {{ fetchError }}
    </p>

    <PrototypeSwitcher :variants="VARIANTS" />
  </div>
</template>
