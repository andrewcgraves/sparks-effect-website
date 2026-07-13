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
</script>

<template>
  <div class="address-autocomplete">
    <label class="address-autocomplete__label">
      Origin address
      <div class="address-autocomplete__input-wrap">
        <input
          v-model="inputValue"
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
          class="address-autocomplete__foldout"
        >
          <p
            v-if="isLoading"
            class="address-autocomplete__foldout-status"
            data-testid="suggestions-loading"
          >
            Searching…
          </p>
          <ul
            v-else-if="suggestions.length > 0"
            class="address-autocomplete__list"
            data-testid="suggestions"
            role="listbox"
          >
            <li
              v-for="suggestion in suggestions"
              :key="`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`"
              role="option"
              @click="onSelect(suggestion)"
            >
              {{ suggestion.label }}
            </li>
          </ul>
          <p
            v-else
            class="address-autocomplete__foldout-status"
            data-testid="suggestions-empty"
          >
            No results found
          </p>
        </div>
      </div>
    </label>
  </div>
</template>

<style scoped>
.address-autocomplete {
  margin-bottom: 0.75rem;
}

.address-autocomplete__label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font: 14px/1.4 system-ui, 'Segoe UI', Roboto, sans-serif;
}

.address-autocomplete__input-wrap {
  position: relative;
}

.address-autocomplete__input-wrap input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.45rem 0.6rem;
  border: 1px solid #c8c8c8;
  border-radius: 4px;
  font: inherit;
}

.address-autocomplete__foldout {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 10;
  background: #fff;
  border: 1px solid #b0b8c4;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
  max-height: 240px;
  overflow-y: auto;
}

.address-autocomplete__foldout-status {
  margin: 0;
  padding: 0.55rem 0.7rem;
  font: 13px/1.3 system-ui, 'Segoe UI', Roboto, sans-serif;
  color: #666;
}

.address-autocomplete__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.address-autocomplete__list li {
  padding: 0.55rem 0.7rem;
  cursor: pointer;
  font: 14px/1.35 system-ui, 'Segoe UI', Roboto, sans-serif;
  border-bottom: 1px solid #f0f0f0;
}

.address-autocomplete__list li:last-child {
  border-bottom: none;
}

.address-autocomplete__list li:hover,
.address-autocomplete__list li:focus {
  background: #f0f4f8;
}
</style>
