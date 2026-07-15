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

<style scoped>
form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem var(--page-gutter) 1.75rem;
  font-family: var(--font-body);
}

form > label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-ink);
  max-width: 360px;
}

form > label input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #ffffff;
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: 0.9375rem;
  font-weight: 400;
  transition: border-color 0.18s var(--ease-smooth), box-shadow 0.18s var(--ease-smooth);
}

form > label input::placeholder {
  color: var(--color-placeholder);
}

form > label input:focus {
  outline: none;
  border-color: var(--color-coral);
  box-shadow: 0 0 0 3px rgb(225 102 91 / 18%);
}

button[data-testid="use-current-location"] {
  align-self: flex-start;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s var(--ease-smooth), border-color 0.18s var(--ease-smooth);
}

button[data-testid="use-current-location"]:hover:not(:disabled) {
  border-color: var(--color-apricot);
  background: #ffffff;
}

button[data-testid="use-current-location"]:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

[data-testid="location-error"] {
  margin: 0;
  color: var(--color-coral);
  font-size: 0.8125rem;
}

[data-testid="selected-label"] {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: 0.8125rem;
}

fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  max-width: 360px;
}

legend {
  padding: 0 0.4rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-ink-muted);
}

fieldset label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-body);
  font-size: 0.9375rem;
  color: var(--color-ink);
  cursor: pointer;
}

fieldset input[type="radio"] {
  accent-color: var(--color-coral);
  cursor: pointer;
}

button[type="submit"] {
  align-self: flex-start;
  margin-top: 0.25rem;
  padding: 0.7rem 1.4rem;
  border: none;
  border-radius: 999px;
  background: var(--color-coral);
  color: #ffffff;
  font-family: var(--font-display);
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.18s var(--ease-smooth), transform 0.18s var(--ease-smooth);
}

button[type="submit"]:hover {
  background: var(--color-apricot);
}

button[type="submit"]:active {
  transform: translateY(1px);
}
</style>
