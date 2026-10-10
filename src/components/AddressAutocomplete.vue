<script setup lang="ts">
import { ref, computed, useId } from 'vue'
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
const activeIndex = ref(-1)
const listboxId = useId()
const inputId = useId()

function optionId(index: number): string {
  return `${listboxId}-option-${index}`
}

const activeOptionId = computed(() =>
  activeIndex.value >= 0 && activeIndex.value < suggestions.value.length
    ? optionId(activeIndex.value)
    : undefined,
)

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
    activeIndex.value = -1
    hasSearched.value = true
  } finally {
    isLoading.value = false
  }
}

function onInput() {
  activeIndex.value = -1
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!inputValue.value.trim()) {
    suggestions.value = []
    hasSearched.value = false
    return
  }
  debounceTimer = setTimeout(() => void fetchAndUpdate(), DEBOUNCE_MS)
}

function moveActive(step: 1 | -1) {
  const count = suggestions.value.length
  if (count === 0) return
  activeIndex.value = activeIndex.value < 0 && step < 0
    ? count - 1
    : (activeIndex.value + step + count) % count
}

function close() {
  suggestions.value = []
  hasSearched.value = false
  activeIndex.value = -1
}

function onEnter(event: Event) {
  event.preventDefault()
  const active = suggestions.value[activeIndex.value]
  if (active) {
    onSelect(active)
    return
  }
  if (!inputValue.value.trim()) return
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  void fetchAndUpdate()
}

function onSelect(suggestion: GeocodingSuggestion) {
  inputValue.value = suggestion.label
  close()
  emit('select', suggestion)
}

function setInputValue(value: string) {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  inputValue.value = value
  close()
  isLoading.value = false
}

defineExpose({ setInputValue })
</script>

<template>
  <div class="address-autocomplete flex flex-col gap-1">
    <label
      :for="inputId"
      :class="FIELD_LABEL_CLASS"
    >
      Location
    </label>
    <div class="flex items-center gap-2">
      <div class="relative min-w-0 flex-1">
        <input
          :id="inputId"
          v-model="inputValue"
          :class="[FIELD_INPUT_CLASS, 'h-9 w-full placeholder:text-placeholder']"
          type="text"
          placeholder="Start typing a place name"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          :aria-controls="listboxId"
          :aria-expanded="foldoutOpen"
          :aria-activedescendant="activeOptionId"
          @input="onInput"
          @keydown.enter="onEnter"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.esc="close"
        >
        <div
          v-if="foldoutOpen"
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
            :id="listboxId"
            class="m-0 list-none p-0"
            data-testid="suggestions"
            role="listbox"
            aria-label="Places"
          >
            <li
              v-for="(suggestion, index) in suggestions"
              :id="optionId(index)"
              :key="`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`"
              class="font-body cursor-pointer border-b border-border px-3 py-2 text-[14px] text-ink not-italic normal-case transition-colors duration-200 ease-(--ease-smooth) last:border-b-0 hover:bg-surface aria-selected:bg-surface aria-selected:outline-2 aria-selected:-outline-offset-2 aria-selected:outline-coral"
              role="option"
              :aria-selected="index === activeIndex"
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
      <slot name="trailing" />
    </div>
  </div>
</template>
