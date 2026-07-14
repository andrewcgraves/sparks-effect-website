<script setup lang="ts">
import { ref, watch } from 'vue'
import AddressAutocomplete from './components/AddressAutocomplete.vue'
import type { GeocodingSuggestion } from './api/geocoding'
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
const mode = ref<Mode>('walk')

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
    <AddressAutocomplete @select="onAutocompleteSelect" />
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
