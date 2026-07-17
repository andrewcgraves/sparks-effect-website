<script setup lang="ts">
import { ref, watch } from 'vue'
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

const emit = defineEmits<{
  submit: [payload: { lat: number; lng: number; duration: number; mode: Mode }]
  'origin-change': [origin: { lat: number; lng: number } | null]
}>()

const lat = ref('')
const lng = ref('')
const duration = ref('')
const selectedLabel = ref('')
const locationError = ref('')
const locating = ref(false)
const mode = ref<Mode>('walk')
const addressAutocompleteRef = ref<InstanceType<typeof AddressAutocomplete> | null>(null)
let locationRequestId = 0

watch([lat, lng], ([newLat, newLng]) => {
  const parsedLat = parseFloat(newLat)
  const parsedLng = parseFloat(newLng)
  if (isFinite(parsedLat) && isFinite(parsedLng)) {
    emit('origin-change', { lat: parsedLat, lng: parsedLng })
  } else {
    emit('origin-change', null)
  }
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
  if (lat.value === '' || lng.value === '' || duration.value === '') return

  emit('submit', {
    lat: parseFloat(lat.value),
    lng: parseFloat(lng.value),
    duration: parseFloat(duration.value),
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
      <input
        v-model="duration"
        :class="FIELD_INPUT_CLASS"
        data-testid="duration"
        type="number"
        min="1"
      >
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
      class="font-display text-btn mt-1 cursor-pointer rounded-(--radius-field) bg-coral px-4 py-2.5 text-white uppercase transition-colors duration-200 ease-(--ease-smooth) hover:bg-ink"
    >
      Generate isochrone
    </button>
  </form>
</template>
