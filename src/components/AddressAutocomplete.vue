<script setup lang="ts">
import { ref } from 'vue'
import { fetchSuggestions, type GeocodingSuggestion } from '../api/geocoding'

const emit = defineEmits<{
  select: [payload: GeocodingSuggestion]
}>()

const inputValue = ref('')
const suggestions = ref<GeocodingSuggestion[]>([])

async function onInput() {
  suggestions.value = await fetchSuggestions(inputValue.value)
}

function onSelect(suggestion: GeocodingSuggestion) {
  inputValue.value = suggestion.label
  suggestions.value = []
  emit('select', suggestion)
}
</script>

<template>
  <div class="address-autocomplete">
    <input
      v-model="inputValue"
      type="text"
      placeholder="Search for an address"
      autocomplete="off"
      @input="onInput"
    >
    <ul
      v-if="suggestions.length > 0"
      data-testid="suggestions"
    >
      <li
        v-for="suggestion in suggestions"
        :key="suggestion.label"
        @click="onSelect(suggestion)"
      >
        {{ suggestion.label }}
      </li>
    </ul>
  </div>
</template>
