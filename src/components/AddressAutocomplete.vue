<script setup lang="ts">
import { ref, computed } from 'vue'
import { fetchSuggestions, type GeocodingSuggestion } from '../api/geocoding'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from './fieldStyles'

const DEBOUNCE_MS = 300

const emit = defineEmits<{
  select: [payload: GeocodingSuggestion]
}>()

const inputValue = ref('')
const suggestions = ref<GeocodingSuggestion[]>([])
const isLoading = ref(false)
const hasSearched = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

const foldoutOpen = computed(
  () =>
    isLoading.value ||
    suggestions.value.length > 0 ||
    (hasSearched.value && inputValue.value.trim().length > 0),
)

async function fetchAndUpdate() {
  const query = inputValue.value
  if (!query.trim()) {
    suggestions.value = []
    hasSearched.value = false
    return
  }
  isLoading.value = true
  try {
    suggestions.value = await fetchSuggestions(query)
    hasSearched.value = true
  } finally {
    isLoading.value = false
  }
}

function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!inputValue.value.trim()) {
    suggestions.value = []
    hasSearched.value = false
    return
  }
  debounceTimer = setTimeout(() => void fetchAndUpdate(), DEBOUNCE_MS)
}

function onEnter(event: Event) {
  event.preventDefault()
  if (!inputValue.value.trim()) return
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  void fetchAndUpdate()
}

function onSelect(suggestion: GeocodingSuggestion) {
  inputValue.value = suggestion.label
  suggestions.value = []
  hasSearched.value = false
  emit('select', suggestion)
}

function setInputValue(value: string) {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  inputValue.value = value
  suggestions.value = []
  hasSearched.value = false
  isLoading.value = false
}

defineExpose({ setInputValue })
</script>

<template>
  <!-- .address-autocomplete is kept as a hook for IsochroneForm.spec.ts. -->
  <div class="address-autocomplete">
    <label :class="FIELD_LABEL_CLASS">
      Location
      <div class="relative">
        <input
          v-model="inputValue"
          :class="[FIELD_INPUT_CLASS, 'w-full placeholder:text-placeholder']"
          type="text"
          placeholder="Start typing a place name"
          autocomplete="off"
          aria-autocomplete="list"
          aria-controls="address-suggestions"
          :aria-expanded="foldoutOpen"
          @input="onInput"
          @keydown.enter="onEnter"
        >
        <div
          v-if="foldoutOpen"
          id="address-suggestions"
          class="absolute top-[calc(100%+2px)] right-0 left-0 z-10 max-h-[240px] overflow-y-auto rounded-(--radius-field) border border-border bg-white shadow-(--shadow-panel)"
        >
          <p
            v-if="isLoading"
            class="font-body text-caption px-3 py-2 text-ink-muted italic"
            data-testid="suggestions-loading"
          >
            Searching…
          </p>
          <ul
            v-else-if="suggestions.length > 0"
            class="m-0 list-none p-0"
            data-testid="suggestions"
            role="listbox"
          >
            <li
              v-for="suggestion in suggestions"
              :key="`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`"
              class="font-body cursor-pointer border-b border-border px-3 py-2 text-[14px] text-ink not-italic normal-case transition-colors duration-200 ease-(--ease-smooth) last:border-b-0 hover:bg-surface"
              role="option"
              @click="onSelect(suggestion)"
            >
              {{ suggestion.label }}
            </li>
          </ul>
          <p
            v-else
            class="font-body text-caption px-3 py-2 text-ink-muted italic"
            data-testid="suggestions-empty"
          >
            No results found
          </p>
        </div>
      </div>
    </label>
  </div>
</template>
