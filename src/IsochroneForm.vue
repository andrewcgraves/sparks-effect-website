<script setup lang="ts">
import { ref, watch } from 'vue'
import AddressAutocomplete from './components/AddressAutocomplete.vue'
import type { GeocodingSuggestion } from './api/geocoding'
import { reverseGeocode } from './api/geocoding'
import { getCurrentPosition } from './api/geolocation'
import { trackModeToggle } from './analytics/index'

type Mode = 'walk' | 'bike' | 'drive'

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
  <form @submit.prevent="handleSubmit">
    <AddressAutocomplete
      ref="addressAutocompleteRef"
      @select="onAutocompleteSelect"
    />
    <button
      type="button"
      data-testid="use-current-location"
      :disabled="locating"
      @click="onUseCurrentLocation"
    >
      Use my location
    </button>
    <p
      v-if="locationError"
      data-testid="location-error"
    >
      {{ locationError }}
    </p>
    <p
      v-if="selectedLabel"
      data-testid="selected-label"
    >
      {{ selectedLabel }}
    </p>
    <label>
      Latitude
      <input
        v-model="lat"
        data-testid="lat"
        type="number"
        step="any"
      >
    </label>
    <label>
      Longitude
      <input
        v-model="lng"
        data-testid="lng"
        type="number"
        step="any"
      >
    </label>
    <label>
      Journey duration (minutes)
      <input
        v-model="duration"
        data-testid="duration"
        type="number"
        min="1"
      >
    </label>
    <fieldset>
      <legend>Mode</legend>
      <label>
        <input
          type="radio"
          name="mode"
          value="walk"
          :checked="mode === 'walk'"
          data-testid="mode-walk"
          @change="onModeChange('walk')"
        >
        Walk
      </label>
      <label>
        <input
          type="radio"
          name="mode"
          value="bike"
          :checked="mode === 'bike'"
          data-testid="mode-bike"
          @change="onModeChange('bike')"
        >
        Bike
      </label>
      <label>
        <input
          type="radio"
          name="mode"
          value="drive"
          :checked="mode === 'drive'"
          data-testid="mode-drive"
          @change="onModeChange('drive')"
        >
        Drive
      </label>
    </fieldset>
    <button type="submit">
      Generate isochrone
    </button>
  </form>
</template>
