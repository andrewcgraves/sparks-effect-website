<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import AddressAutocomplete from './components/AddressAutocomplete.vue'
import SegmentedControl from './components/SegmentedControl.vue'
import { PRIMARY_BUTTON_CLASS } from './components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from './components/fieldStyles'
import { ACTION_LINK_CLASS } from './components/linkStyles'
import type { GeocodingSuggestion } from './api/geocoding'
import { reverseGeocode } from './api/geocoding'
import { getCurrentPosition } from './api/geolocation'
import { trackModeToggle } from './analytics/index'
import { TRAVEL_MODES, type TravelMode } from './api/authoring/types'
import { DEFAULT_DURATION, DEFAULT_MODE, DURATION_OPTIONS, type IsochronePayload } from './isochroneQuery'
import { MODE_LABELS, MODE_TRIPS } from './copy/modes'
import { OFFLINE_REASON } from './composables/useRoutingStatus'

const MODE_ICONS: Record<TravelMode, string> = {
  walk: '🚶',
  bike: '🚲',
  drive: '🚗',
  transit: '🚆',
}

const MODE_OPTIONS: { value: TravelMode; label: string; icon: string }[] = TRAVEL_MODES.map((value) => ({
  value,
  label: MODE_LABELS[value],
  icon: MODE_ICONS[value],
}))

const ICON_BUTTON_CLASS =
  'flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-field) border transition-colors duration-200 ease-(--ease-smooth) pointer-coarse:size-11 disabled:cursor-not-allowed disabled:opacity-50'

function formatDuration(value: number): string {
  return `${value} min`
}

const props = withDefaults(
  defineProps<{
    error?: string | null
    loading?: boolean
    offline?: boolean
    initial?: Partial<IsochronePayload>
    framed?: boolean
  }>(),
  { error: null, loading: false, offline: false, initial: () => ({}), framed: true },
)

const emit = defineEmits<{
  submit: [payload: IsochronePayload]
  'origin-change': [origin: { lat: number; lng: number } | null]
  'pick-armed': [armed: boolean]
}>()

// Read once: the form is the user's from the moment it appears.
const { initial } = props
const lat = ref(initial.lat === undefined ? '' : String(initial.lat))
const lng = ref(initial.lng === undefined ? '' : String(initial.lng))
const duration = ref(initial.duration ?? DEFAULT_DURATION)
const locationError = ref('')
const locating = ref(false)
const mode = ref<TravelMode>(initial.mode ?? DEFAULT_MODE)
const pickArmed = ref(false)
const addressAutocompleteRef = ref<InstanceType<typeof AddressAutocomplete> | null>(null)
const originName = ref('')
const coordinatesOpen = ref(false)
const coordinatesId = useId()
let locationRequestId = 0

function parseOrigin(latText: string, lngText: string): { lat: number; lng: number } | null {
  const parsedLat = parseFloat(latText)
  const parsedLng = parseFloat(lngText)
  return isFinite(parsedLat) && isFinite(parsedLng) ? { lat: parsedLat, lng: parsedLng } : null
}

const origin = computed(() => parseOrigin(lat.value, lng.value))
const isValid = computed(() => origin.value !== null)

// The chooser and the card naming a chosen start never show together. Typing
// coordinates keeps the chooser open — a half-typed pair would otherwise fold
// it away mid-keystroke — so only a finished choice closes it.
const choosing = ref(!isValid.value)
const changing = ref(false)
const showCard = computed(() => isValid.value && !choosing.value)

function closeChooser() {
  choosing.value = false
  changing.value = false
}

function openChooser() {
  choosing.value = true
  changing.value = true
}

const coordsText = computed(() =>
  origin.value ? `${origin.value.lat.toFixed(4)}, ${origin.value.lng.toFixed(4)}` : '',
)

const errorDismissed = ref(false)
watch(() => props.error, () => {
  errorDismissed.value = false
})
watch([lat, lng, duration, mode], () => {
  errorDismissed.value = true
})

const showError = computed(() => !!props.error && !errorDismissed.value)

watch([lat, lng], ([newLat, newLng]) => {
  emit('origin-change', parseOrigin(newLat, newLng))
})

watch(pickArmed, (armed) => {
  emit('pick-armed', armed)
})

watch([lat, lng], () => {
  pickArmed.value = false
})

// A cleared start has nothing left to name, so the chooser comes back.
watch(isValid, (valid) => {
  if (!valid) choosing.value = true
})

// Chrome turns a wheel or trackpad scroll over a focused number field into a
// step of its value, so a visitor scrolling past the form would nudge the
// starting point. Letting go of focus first keeps the value and lets the page
// scroll. The fields stay `type="number"`: an iOS decimal keypad has no minus
// key, and California longitudes are negative.
function blurOnWheel(event: WheelEvent) {
  const field = event.currentTarget as HTMLInputElement
  if (document.activeElement === field) field.blur()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') pickArmed.value = false
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

function setOrigin(coord: { lat: number; lng: number }, name: string) {
  pickArmed.value = false
  lat.value = String(coord.lat)
  lng.value = String(coord.lng)
  originName.value = name
  closeChooser()
}

function setOriginFromMap(coord: { lat: number; lng: number }) {
  if (!pickArmed.value) return
  // Not reverse-geocoded: each lookup spends 20 geocoder credits, and the
  // coordinates beside the name already say where the pin is.
  setOrigin(coord, 'Dropped pin')
  addressAutocompleteRef.value?.setInputValue('')
}

const extraDuration = ref<number | null>(null)
const durationOptions = computed(() =>
  extraDuration.value === null
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, extraDuration.value].sort((a, b) => a - b),
)

function fill(payload: IsochronePayload) {
  // A saved splash zone may have been plotted with a travel time the form does
  // not offer; it is shown as its own option rather than rounded to a near one,
  // which would no longer be the splash zone on the map.
  extraDuration.value = DURATION_OPTIONS.includes(payload.duration) ? null : payload.duration
  setOrigin(payload, '')
  duration.value = payload.duration
  mode.value = payload.mode
  addressAutocompleteRef.value?.setInputValue('')
}

defineExpose({ setOriginFromMap, fill })

function onAutocompleteSelect(suggestion: GeocodingSuggestion) {
  setOrigin(suggestion, suggestion.label)
}

function onCoordinateInput() {
  originName.value = ''
}

async function onUseCurrentLocation() {
  if (locating.value) return
  // Disarm on the click, not on the fix: the user has visibly switched methods,
  // and a stray map click while the lookup is in flight would only be overwritten.
  pickArmed.value = false
  locating.value = true
  locationError.value = ''
  const requestId = ++locationRequestId
  try {
    const position = await getCurrentPosition()
    if (requestId !== locationRequestId) return
    setOrigin(position, 'Your location')
    const suggestion = await reverseGeocode(position.lat, position.lng)
    if (requestId !== locationRequestId) return
    if (lat.value !== String(position.lat) || lng.value !== String(position.lng)) return
    if (suggestion?.label) originName.value = suggestion.label
    addressAutocompleteRef.value?.setInputValue(suggestion?.label ?? '')
  } catch {
    if (requestId !== locationRequestId) return
    locationError.value = 'Unable to get your current location.'
  } finally {
    if (requestId === locationRequestId) {
      locating.value = false
    }
  }
}

function onModeChange(newMode: TravelMode) {
  mode.value = newMode
  trackModeToggle(newMode)
}

const submitLabel = computed(() => {
  if (props.loading) return 'Plotting…'
  if (!isValid.value) return 'Choose a starting point first'
  return `Plot a ${duration.value}-min ${MODE_TRIPS[mode.value]}`
})

function handleSubmit() {
  if (lat.value === '' || lng.value === '' || props.offline) return

  emit('submit', {
    lat: parseFloat(lat.value),
    lng: parseFloat(lng.value),
    duration: duration.value,
    mode: mode.value,
  })
}
</script>

<template>
  <form
    class="flex flex-col gap-5"
    :class="{ 'rounded-(--radius-box) border border-border bg-surface p-4': framed }"
    @submit.prevent="handleSubmit"
  >
    <h2
      v-if="framed"
      class="font-display text-h3 text-ink-true"
    >
      Plot a splash zone
    </h2>

    <div class="flex flex-col gap-1.5">
      <div
        v-if="showCard"
        class="flex flex-col gap-1"
      >
        <span :class="FIELD_LABEL_CLASS">Starting point</span>
        <div
          class="flex items-center gap-3 rounded-(--radius-field) border border-coral/60 bg-white px-3 py-2"
          data-testid="origin-card"
        >
          <span
            aria-hidden="true"
            class="text-lg"
          >📍</span>
          <div class="min-w-0 flex-1">
            <p
              class="font-body truncate text-[14px] text-ink"
              data-testid="origin-name"
            >
              {{ originName || 'Starting point' }}
            </p>
            <p class="font-body text-caption text-ink-muted tabular-nums">
              {{ coordsText }}
            </p>
          </div>
          <button
            type="button"
            :class="ACTION_LINK_CLASS"
            data-testid="change-origin"
            @click="openChooser"
          >
            Change
          </button>
        </div>
      </div>

      <!-- Hidden rather than removed: the address field keeps its text and
           the coordinates keep what was typed while the card is showing. -->
      <div
        v-show="!showCard"
        class="flex flex-col gap-1.5"
        data-testid="origin-chooser"
      >
        <AddressAutocomplete
          ref="addressAutocompleteRef"
          @select="onAutocompleteSelect"
        >
          <template #trailing>
            <button
              type="button"
              :class="[ICON_BUTTON_CLASS, 'border-border bg-white text-ink-muted hover:border-coral hover:text-coral']"
              data-testid="use-current-location"
              aria-label="Use my location"
              title="Use my location"
              :aria-busy="locating"
              :disabled="locating"
              @click="onUseCurrentLocation"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                class="size-5 fill-none stroke-current stroke-2"
                :class="{ 'animate-pulse': locating }"
                stroke-linecap="round"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="7"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="2.5"
                  class="fill-current"
                />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            </button>
            <button
              type="button"
              :class="[ICON_BUTTON_CLASS, pickArmed ? 'border-coral bg-coral' : 'border-border bg-white hover:border-coral']"
              data-testid="pick-on-map"
              aria-label="Pick the starting point on the map"
              title="Pick on the map"
              :aria-pressed="pickArmed"
              @click="pickArmed = !pickArmed"
            >
              <span aria-hidden="true">📍</span>
            </button>
            <button
              type="button"
              :class="[ICON_BUTTON_CLASS, coordinatesOpen ? 'border-coral bg-coral/10' : 'border-border bg-white hover:border-coral']"
              data-testid="enter-coordinates"
              aria-label="Enter coordinates"
              title="Enter coordinates"
              :aria-expanded="coordinatesOpen"
              :aria-controls="coordinatesId"
              @click="coordinatesOpen = !coordinatesOpen"
            >
              <span aria-hidden="true">🌐</span>
            </button>
          </template>
        </AddressAutocomplete>

        <!-- Hidden rather than removed, like the chooser around it, so typed
             coordinates survive closing the fields. -->
        <div
          v-show="coordinatesOpen"
          :id="coordinatesId"
          data-testid="coordinates"
        >
          <div class="grid grid-cols-2 gap-3">
            <label :class="FIELD_LABEL_CLASS">
              Latitude
              <input
                v-model="lat"
                :class="FIELD_INPUT_CLASS"
                data-testid="lat"
                type="number"
                step="any"
                @input="onCoordinateInput"
                @wheel.passive="blurOnWheel"
              >
            </label>
            <label :class="FIELD_LABEL_CLASS">
              Longitude
              <input
                v-model="lng"
                :class="FIELD_INPUT_CLASS"
                data-testid="lng"
                type="number"
                step="any"
                @input="onCoordinateInput"
                @wheel.passive="blurOnWheel"
              >
            </label>
          </div>
        </div>

        <button
          v-if="changing && isValid"
          type="button"
          :class="[ACTION_LINK_CLASS, 'self-start']"
          data-testid="keep-origin"
          @click="closeChooser"
        >
          Keep this starting point
        </button>
      </div>

      <p
        v-if="locationError"
        class="font-body text-caption text-error italic"
        data-testid="location-error"
      >
        {{ locationError }}
      </p>
    </div>

    <fieldset class="flex flex-col gap-1 border-0 p-0">
      <legend :class="FIELD_LABEL_CLASS">
        Getting around by
      </legend>
      <div class="grid grid-cols-4 gap-2">
        <label
          v-for="option in MODE_OPTIONS"
          :key="option.value"
          class="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-(--radius-field) border py-2.5 transition-colors duration-200 ease-(--ease-smooth) has-focus-visible:outline-(length:--focus-ring-width) has-focus-visible:outline-offset-(--focus-ring-offset) has-focus-visible:outline-focus"
          :class="mode === option.value ? 'border-coral bg-coral/10 text-ink' : 'border-border bg-white text-ink-muted hover:border-ink-faint'"
          :data-testid="`mode-tile-${option.value}`"
        >
          <input
            type="radio"
            name="mode"
            class="sr-only"
            :value="option.value"
            :checked="mode === option.value"
            :data-testid="`mode-${option.value}`"
            @change="onModeChange(option.value)"
          >
          <span
            aria-hidden="true"
            class="text-2xl leading-none"
          >{{ option.icon }}</span>
          <span class="font-body text-caption">{{ option.label }}</span>
        </label>
      </div>
    </fieldset>

    <!-- The label sits beside the control, not around it: wrapped, the options
         would inherit the label's micro letter-spacing and stop matching the
         same control on the Stations card. -->
    <div class="flex flex-col gap-1">
      <span :class="FIELD_LABEL_CLASS">For up to</span>
      <SegmentedControl
        v-model="duration"
        class="self-start"
        :options="durationOptions"
        :format-option="formatDuration"
        label="Travel time"
        name="duration"
        testid="duration-slider"
      />
    </div>

    <!-- The reason sits on a wrapper: a disabled button gets no pointer
         events, so in some browsers its own title would never show. -->
    <span
      class="flex flex-col"
      :title="offline ? OFFLINE_REASON : undefined"
      data-testid="plot-reason"
    >
      <button
        type="submit"
        :class="PRIMARY_BUTTON_CLASS"
        :disabled="!isValid || loading || offline"
      >
        {{ submitLabel }}
      </button>
    </span>

    <p
      v-if="showError"
      class="font-body text-caption text-error"
      role="alert"
      data-testid="fetch-error"
    >
      {{ error }}
    </p>
  </form>
</template>
