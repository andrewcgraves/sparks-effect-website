<script setup lang="ts">
import { ref, watch } from 'vue'
import AddressAutocomplete from './components/AddressAutocomplete.vue'
import type { GeocodingSuggestion } from './api/geocoding'

const emit = defineEmits<{
  submit: [payload: { lat: number; lng: number; duration: number }]
  'origin-change': [origin: { lat: number; lng: number } | null]
}>()

const lat = ref('')
const lng = ref('')
const duration = ref('')
const selectedLabel = ref('')

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

function handleSubmit() {
  if (lat.value === '' || lng.value === '' || duration.value === '') return

  emit('submit', {
    lat: parseFloat(lat.value),
    lng: parseFloat(lng.value),
    duration: parseFloat(duration.value),
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
    <button type="submit">
      Generate isochrone
    </button>
  </form>
</template>
