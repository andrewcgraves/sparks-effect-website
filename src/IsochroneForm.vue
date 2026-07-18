<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AddressAutocomplete from './components/AddressAutocomplete.vue'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from './components/fieldStyles'
import type { GeocodingSuggestion } from './api/geocoding'
import { reverseGeocode } from './api/geocoding'
import { getCurrentPosition } from './api/geolocation'
import { trackModeToggle } from './analytics/index'

type Mode = 'walk' | 'bike' | 'drive'

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'walk', label: 'Walk' },
  { value: 'bike', label: 'Bike' },
  { value: 'drive', label: 'Drive' },
]

const DURATION_MIN = 0
const DURATION_MAX = 120

const props = withDefaults(
  defineProps<{
    error?: string | null
    loading?: boolean
  }>(),
  { error: null, loading: false },
)

const emit = defineEmits<{
  submit: [payload: { lat: number; lng: number; duration: number; mode: Mode }]
  'origin-change': [origin: { lat: number; lng: number } | null]
}>()

const lat = ref('')
const lng = ref('')
const duration = ref(30)
const durationText = ref(String(duration.value))
const selectedLabel = ref('')
const locationError = ref('')
const locating = ref(false)
const mode = ref<Mode>('walk')
const addressAutocompleteRef = ref<InstanceType<typeof AddressAutocomplete> | null>(null)
let locationRequestId = 0

// Shared origin parse used by both the submit gate and the origin-change watcher.
function parseOrigin(latText: string, lngText: string): { lat: number; lng: number } | null {
  const parsedLat = parseFloat(latText)
  const parsedLng = parseFloat(lngText)
  return isFinite(parsedLat) && isFinite(parsedLng) ? { lat: parsedLat, lng: parsedLng } : null
}

// Enable submit only once we have a parseable origin and a non-zero travel time.
// Duration always arrives as a number in [0, 120] from the slider, so 0 is the
// only value it gates.
const isValid = computed(() => parseOrigin(lat.value, lng.value) !== null && duration.value > 0)

// The fetch error is owned by the parent, but a stale error shouldn't linger once
// the user starts fixing their input. Locally suppress it after any field edit; a
// fresh error prop (including the null→message flip on the next submit) un-suppresses.
const errorDismissed = ref(false)
watch(() => props.error, () => {
  errorDismissed.value = false
})
watch([lat, lng, duration, mode], () => {
  errorDismissed.value = true
})

const showError = computed(() => !!props.error && !errorDismissed.value)
const showHint = computed(() => !showError.value && !isValid.value)

watch(duration, (value) => {
  durationText.value = String(value)
})

function onDurationBlur() {
  // Vue auto-casts v-model on type="number" inputs to a number when parseable,
  // so durationText.value isn't reliably a string here.
  const raw = String(durationText.value)
  const parsed = Math.round(Number(raw))
  const durationParseable = raw.trim() !== '' && Number.isFinite(parsed)
  const clamped = durationParseable ? Math.min(DURATION_MAX, Math.max(DURATION_MIN, parsed)) : duration.value
  duration.value = clamped
  durationText.value = String(clamped)
}

watch([lat, lng], ([newLat, newLng]) => {
  emit('origin-change', parseOrigin(newLat, newLng))
})

function onAutocompleteSelect(suggestion: GeocodingSuggestion) {
  lat.value = String(suggestion.lat)
  lng.value = String(suggestion.lng)
  selectedLabel.value = suggestion.label
}

async function onUseCurrentLocation() {
  if (locating.value) return
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

function onModeChange(newMode: Mode) {
  mode.value = newMode
  trackModeToggle(newMode)
}

function handleSubmit() {
  if (lat.value === '' || lng.value === '') return

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
      />
      <button
        type="button"
        class="font-display text-btn self-start text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="use-current-location"
        :disabled="locating"
        @click="onUseCurrentLocation"
      >
        📍 Use my location
      </button>
      <p
        v-if="locationError"
        class="font-body text-caption text-coral italic"
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

    <label :class="FIELD_LABEL_CLASS">
      Travel time (minutes)
      <div class="flex items-center gap-3">
        <input
          v-model.number="duration"
          type="range"
          :min="DURATION_MIN"
          :max="DURATION_MAX"
          step="1"
          class="accent-coral flex-1"
          data-testid="duration-slider"
        >
        <input
          v-model="durationText"
          :class="FIELD_INPUT_CLASS"
          class="w-20"
          data-testid="duration"
          type="number"
          :min="DURATION_MIN"
          :max="DURATION_MAX"
          step="1"
          @blur="onDurationBlur"
        >
      </div>
    </label>

    <fieldset class="flex flex-col gap-2 border-0 p-0">
      <legend class="font-body text-micro text-ink-muted italic uppercase">
        Mode
      </legend>
      <div class="flex gap-4">
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

    <button
      type="submit"
      class="font-display text-btn mt-1 cursor-pointer rounded-(--radius-field) bg-coral px-4 py-2.5 text-white uppercase transition-colors duration-200 ease-(--ease-smooth) hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-coral"
      :disabled="!isValid || loading"
    >
      {{ loading ? 'Generating…' : 'Generate isochrone' }}
    </button>

    <p
      v-if="showError"
      class="font-body text-caption text-coral"
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
