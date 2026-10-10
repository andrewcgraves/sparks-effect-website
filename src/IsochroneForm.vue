<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AddressAutocomplete from './components/AddressAutocomplete.vue'
import SegmentedControl from './components/SegmentedControl.vue'
import { PRIMARY_BUTTON_CLASS } from './components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from './components/fieldStyles'
import type { GeocodingSuggestion } from './api/geocoding'
import { reverseGeocode } from './api/geocoding'
import { getCurrentPosition } from './api/geolocation'
import { trackModeToggle } from './analytics/index'
import { TRAVEL_MODES, type TravelMode } from './api/authoring/types'
import { DEFAULT_DURATION, DEFAULT_MODE, DURATION_OPTIONS, type IsochronePayload } from './isochroneQuery'

const MODE_LABELS: Record<TravelMode, string> = {
  walk: 'Walk',
  bike: 'Bike',
  drive: 'Drive',
  transit: 'Transit',
}

const MODE_OPTIONS: { value: TravelMode; label: string }[] = TRAVEL_MODES.map((value) => ({
  value,
  label: MODE_LABELS[value],
}))

const OFFLINE_REASON = 'Live routing is offline right now, so new splash zones can’t be plotted.'

function formatDuration(value: number): string {
  return `${value} min`
}

const props = withDefaults(
  defineProps<{
    error?: string | null
    loading?: boolean
    offline?: boolean
    initial?: Partial<IsochronePayload>
  }>(),
  { error: null, loading: false, offline: false, initial: () => ({}) },
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
const selectedLabel = ref('')
const locationError = ref('')
const locating = ref(false)
const mode = ref<TravelMode>(initial.mode ?? DEFAULT_MODE)
const pickArmed = ref(false)
const addressAutocompleteRef = ref<InstanceType<typeof AddressAutocomplete> | null>(null)
let locationRequestId = 0

function parseOrigin(latText: string, lngText: string): { lat: number; lng: number } | null {
  const parsedLat = parseFloat(latText)
  const parsedLng = parseFloat(lngText)
  return isFinite(parsedLat) && isFinite(parsedLng) ? { lat: parsedLat, lng: parsedLng } : null
}

const isValid = computed(() => parseOrigin(lat.value, lng.value) !== null)

const errorDismissed = ref(false)
watch(() => props.error, () => {
  errorDismissed.value = false
})
watch([lat, lng, duration, mode], () => {
  errorDismissed.value = true
})

const showError = computed(() => !!props.error && !errorDismissed.value)
const showHint = computed(() => !showError.value && !isValid.value)

watch([lat, lng], ([newLat, newLng]) => {
  emit('origin-change', parseOrigin(newLat, newLng))
})

watch(pickArmed, (armed) => {
  emit('pick-armed', armed)
})

watch([lat, lng], () => {
  pickArmed.value = false
})

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') pickArmed.value = false
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

function setOriginFromMap(coord: { lat: number; lng: number }) {
  if (!pickArmed.value) return
  pickArmed.value = false
  lat.value = String(coord.lat)
  lng.value = String(coord.lng)
  selectedLabel.value = ''
  addressAutocompleteRef.value?.setInputValue('')
}

defineExpose({ setOriginFromMap })

function onAutocompleteSelect(suggestion: GeocodingSuggestion) {
  pickArmed.value = false
  lat.value = String(suggestion.lat)
  lng.value = String(suggestion.lng)
  selectedLabel.value = suggestion.label
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
    lat.value = String(position.lat)
    lng.value = String(position.lng)
    const suggestion = await reverseGeocode(position.lat, position.lng)
    if (requestId !== locationRequestId) return
    if (lat.value !== String(position.lat) || lng.value !== String(position.lng)) return
    if (suggestion) {
      selectedLabel.value = suggestion.label
      addressAutocompleteRef.value?.setInputValue(suggestion.label)
    } else {
      selectedLabel.value = ''
      addressAutocompleteRef.value?.setInputValue('')
    }
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
    class="flex flex-col gap-4 rounded-(--radius-box) border border-border bg-surface p-4"
    @submit.prevent="handleSubmit"
  >
    <h2 class="font-display text-h3 text-ink-true">
      Plot isochrone
    </h2>

    <div class="flex flex-col gap-2">
      <AddressAutocomplete
        ref="addressAutocompleteRef"
        @select="onAutocompleteSelect"
      >
        <template #trailing>
          <button
            type="button"
            class="flex aspect-square shrink-0 cursor-pointer items-center justify-center rounded-(--radius-field) border border-border bg-white text-ink-muted transition-colors duration-200 ease-(--ease-smooth) hover:border-coral hover:text-coral disabled:cursor-not-allowed disabled:opacity-50"
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
        </template>
      </AddressAutocomplete>
      <button
        type="button"
        class="font-display text-btn self-start uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
        :class="pickArmed ? 'text-coral' : 'text-ink-muted'"
        data-testid="pick-on-map"
        @click="pickArmed = !pickArmed"
      >
        <template v-if="pickArmed">
          Cancel
        </template>
        <template v-else>
          <span aria-hidden="true">📍</span> Pick location on map
        </template>
      </button>
      <p
        v-if="locationError"
        class="font-body text-caption text-error italic"
        data-testid="location-error"
      >
        {{ locationError }}
      </p>
      <p
        v-if="selectedLabel"
        class="font-body text-caption text-ink-muted italic"
        data-testid="selected-label"
      >
        {{ selectedLabel }}
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <label :class="FIELD_LABEL_CLASS">
        Latitude
        <input
          v-model="lat"
          :class="FIELD_INPUT_CLASS"
          data-testid="lat"
          type="number"
          step="any"
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
        >
      </label>
    </div>

    <div :class="FIELD_LABEL_CLASS">
      <span>Travel time</span>
      <SegmentedControl
        v-model="duration"
        :options="DURATION_OPTIONS"
        :format-option="formatDuration"
        label="Travel time"
        name="duration"
        testid="duration-slider"
      />
    </div>

    <fieldset class="flex flex-col gap-2 border-0 p-0">
      <legend class="font-body text-micro text-ink-muted italic uppercase">
        Mode
      </legend>
      <div class="flex flex-wrap gap-x-4 gap-y-1.5">
        <label
          v-for="option in MODE_OPTIONS"
          :key="option.value"
          class="font-body flex cursor-pointer items-center gap-1.5 text-[14px] text-ink"
        >
          <input
            type="radio"
            name="mode"
            class="accent-coral"
            :value="option.value"
            :checked="mode === option.value"
            :data-testid="`mode-${option.value}`"
            @change="onModeChange(option.value)"
          >
          {{ option.label }}
        </label>
      </div>
    </fieldset>

    <!-- The reason sits on a wrapper: a disabled button gets no pointer
         events, so in some browsers its own title would never show. -->
    <span
      class="mt-1 flex flex-col"
      :title="offline ? OFFLINE_REASON : undefined"
      data-testid="plot-reason"
    >
      <button
        type="submit"
        :class="PRIMARY_BUTTON_CLASS"
        :disabled="!isValid || loading || offline"
      >
        {{ loading ? 'Generating…' : 'Generate isochrone' }}
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
    <p
      v-else-if="showHint"
      class="font-body text-caption text-ink-muted italic"
      data-testid="submit-hint"
    >
      Enter a location and travel time to continue.
    </p>
  </form>
</template>
