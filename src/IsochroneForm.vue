<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  submit: [payload: { lat: number; lng: number; duration: number }]
}>()

const lat = ref('')
const lng = ref('')
const duration = ref('')

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
