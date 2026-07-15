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
  gap: 0.3rem;
  max-width: 360px;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-ink);
}

.address-autocomplete__input-wrap {
  position: relative;
}

.address-autocomplete__input-wrap input {
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

.address-autocomplete__input-wrap input::placeholder {
  color: var(--color-placeholder);
}

.address-autocomplete__input-wrap input:focus {
  outline: none;
  border-color: var(--color-coral);
  box-shadow: 0 0 0 3px rgb(225 102 91 / 18%);
}

.address-autocomplete__foldout {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 10;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(18 18 18 / 12%);
  max-height: 240px;
  overflow-y: auto;
}

.address-autocomplete__foldout-status {
  margin: 0;
  padding: 0.55rem 0.7rem;
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.3;
  color: var(--color-ink-muted);
}

.address-autocomplete__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.address-autocomplete__list li {
  padding: 0.55rem 0.7rem;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.35;
  color: var(--color-ink);
  border-bottom: 1px solid var(--color-border);
  transition: background 0.15s var(--ease-smooth);
}

.address-autocomplete__list li:last-child {
  border-bottom: none;
}

.address-autocomplete__list li:hover,
.address-autocomplete__list li:focus {
  background: var(--color-surface);
}
</style>
