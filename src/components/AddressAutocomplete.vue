<script setup lang="ts">
import { ref, computed } from 'vue'
import { fetchSuggestions, type GeocodingSuggestion } from '../api/geocoding'

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
  <div class="mb-3">
    <label class="flex flex-col gap-1 font-body text-sm font-semibold text-ink max-w-[360px]">
      Origin address
      <div class="relative">
        <input
          v-model="inputValue"
          class="w-full box-border px-2.5 py-2 border border-border rounded-lg bg-white text-ink font-body transition-colors ease-[var(--ease-smooth)] placeholder:text-placeholder focus:outline-none focus:border-coral focus:ring-3 focus:ring-coral/20"
          data-testid="address-input"
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
          class="absolute top-[calc(100%+4px)] left-0 right-0 z-10 bg-white border border-border rounded-lg shadow-md max-h-60 overflow-y-auto"
        >
          <p
            v-if="isLoading"
            class="m-0 px-[0.7rem] py-[0.55rem] font-body text-[13px] leading-[1.3] text-ink-muted"
            data-testid="suggestions-loading"
          >
            Searching…
          </p>
          <ul
            v-else-if="suggestions.length > 0"
            class="m-0 p-0 list-none"
            data-testid="suggestions"
            role="listbox"
          >
            <li
              v-for="suggestion in suggestions"
              :key="`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`"
              class="px-2.5 py-2 cursor-pointer font-body text-sm text-ink border-b border-border last:border-b-0 hover:bg-surface focus:bg-surface"
              role="option"
              @click="onSelect(suggestion)"
            >
              {{ suggestion.label }}
            </li>
          </ul>
          <p
            v-else
            class="m-0 px-[0.7rem] py-[0.55rem] font-body text-[13px] leading-[1.3] text-ink-muted"
            data-testid="suggestions-empty"
          >
            No results found
          </p>
        </div>
      </div>
    </label>
  </div>
</template>
