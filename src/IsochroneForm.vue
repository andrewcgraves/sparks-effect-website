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

function onModeChange(event: Event) {
  const newMode = (event.target as HTMLSelectElement).value as Mode
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
    class="flex flex-col gap-4 py-5 px-[var(--page-gutter)] pb-7"
    @submit.prevent="handleSubmit"
  >
    <AddressAutocomplete
      ref="addressAutocompleteRef"
      @select="onAutocompleteSelect"
    />
    <button
      type="button"
      class="self-start px-3.5 py-2 border border-border rounded-full bg-surface font-body text-sm font-semibold cursor-pointer transition-colors ease-[var(--ease-smooth)] hover:not-disabled:border-apricot hover:not-disabled:bg-white disabled:opacity-55 disabled:cursor-not-allowed"
      data-testid="use-current-location"
      :disabled="locating"
      @click="onUseCurrentLocation"
    >
      Use my location
    </button>
    <p
      v-if="locationError"
      class="m-0 text-coral text-[0.8125rem]"
      data-testid="location-error"
    >
      {{ locationError }}
    </p>
    <p
      v-if="selectedLabel"
      class="m-0 text-ink-muted text-[0.8125rem]"
      data-testid="selected-label"
    >
      {{ selectedLabel }}
    </p>
    <label class="flex flex-col gap-1 font-body text-sm font-semibold text-ink max-w-[360px]">
      Latitude
      <input
        v-model="lat"
        class="w-full box-border px-2.5 py-2 border border-border rounded-lg bg-white text-ink font-body transition-colors ease-[var(--ease-smooth)] placeholder:text-placeholder focus:outline-none focus:border-coral focus:ring-3 focus:ring-coral/20"
        data-testid="lat"
        type="number"
        step="any"
      >
    </label>
    <label class="flex flex-col gap-1 font-body text-sm font-semibold text-ink max-w-[360px]">
      Longitude
      <input
        v-model="lng"
        class="w-full box-border px-2.5 py-2 border border-border rounded-lg bg-white text-ink font-body transition-colors ease-[var(--ease-smooth)] placeholder:text-placeholder focus:outline-none focus:border-coral focus:ring-3 focus:ring-coral/20"
        data-testid="lng"
        type="number"
        step="any"
      >
    </label>
    <label class="flex flex-col gap-1 font-body text-sm font-semibold text-ink max-w-[360px]">
      Journey duration (minutes)
      <input
        v-model="duration"
        class="w-full box-border px-2.5 py-2 border border-border rounded-lg bg-white text-ink font-body transition-colors ease-[var(--ease-smooth)] placeholder:text-placeholder focus:outline-none focus:border-coral focus:ring-3 focus:ring-coral/20"
        data-testid="duration"
        type="number"
        min="1"
      >
    </label>
    <label class="flex flex-col gap-1 font-body text-sm font-semibold text-ink max-w-[360px]">
      Mode
      <select
        class="w-full box-border px-2.5 py-2 border border-border rounded-lg bg-white text-ink font-body transition-colors ease-[var(--ease-smooth)] focus:outline-none focus:border-coral focus:ring-3 focus:ring-coral/20"
        data-testid="mode"
        :value="mode"
        @change="onModeChange"
      >
        <option value="walk">
          Walk
        </option>
        <option value="bike">
          Bike
        </option>
        <option value="drive">
          Drive
        </option>
      </select>
    </label>
    <button
      type="submit"
      class="self-start mt-1 px-5.5 py-2.5 rounded-full bg-coral text-white font-display font-semibold cursor-pointer transition-colors ease-[var(--ease-smooth)] hover:bg-apricot active:translate-y-px"
    >
      Generate isochrone
    </button>
  </form>
</template>
