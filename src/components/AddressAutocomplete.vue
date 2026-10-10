<script setup lang="ts">
import { ref, computed, useId } from 'vue'
import {
  fetchSuggestions,
  lookupPlace,
  type AddressMatch,
  type GeocodingSuggestion,
} from '../api/geocoding'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from './fieldStyles'

const DEBOUNCE_MS = 300
// Every search spends geocoder credits, and one or two letters match nothing
// useful, so wait for a third.
const MIN_QUERY_LENGTH = 3

const emit = defineEmits<{
  select: [payload: GeocodingSuggestion]
}>()

const inputValue = ref('')
const matches = ref<AddressMatch[]>([])
const isLoading = ref(false)
const hasSearched = ref(false)
const unavailable = ref(false)
const activeIndex = ref(-1)
const listboxId = useId()

function optionId(index: number): string {
  return `${listboxId}-option-${index}`
}

const activeOptionId = computed(() =>
  activeIndex.value >= 0 && activeIndex.value < matches.value.length
    ? optionId(activeIndex.value)
    : undefined,
)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let inFlight: AbortController | null = null

const foldoutOpen = computed(
  () =>
    isLoading.value ||
    unavailable.value ||
    matches.value.length > 0 ||
    (hasSearched.value && isSearchable(inputValue.value)),
)

function isSearchable(query: string) {
  return query.trim().length >= MIN_QUERY_LENGTH
}

function cancelPending() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  inFlight?.abort()
  inFlight = null
}

function startRequest(): AbortController {
  cancelPending()
  inFlight = new AbortController()
  return inFlight
}

function closeFoldout() {
  matches.value = []
  hasSearched.value = false
  unavailable.value = false
  isLoading.value = false
  activeIndex.value = -1
}

async function fetchAndUpdate() {
  const query = inputValue.value
  if (!isSearchable(query)) {
    cancelPending()
    closeFoldout()
    return
  }
  const request = startRequest()
  isLoading.value = true
  try {
    const found = await fetchSuggestions(query, request.signal)
    if (request.signal.aborted) return
    matches.value = found
    activeIndex.value = -1
    unavailable.value = false
  } catch {
    if (request.signal.aborted) return
    matches.value = []
    unavailable.value = true
  } finally {
    if (inFlight === request) {
      inFlight = null
      isLoading.value = false
      hasSearched.value = true
    }
  }
}

function onInput() {
  activeIndex.value = -1
  cancelPending()
  if (!isSearchable(inputValue.value)) {
    closeFoldout()
    return
  }
  debounceTimer = setTimeout(() => void fetchAndUpdate(), DEBOUNCE_MS)
}

function moveActive(step: 1 | -1) {
  const count = matches.value.length
  if (count === 0) return
  activeIndex.value = activeIndex.value < 0 && step < 0
    ? count - 1
    : (activeIndex.value + step + count) % count
}

function onEnter(event: Event) {
  event.preventDefault()
  const active = matches.value[activeIndex.value]
  if (active) {
    void onSelect(active)
    return
  }
  if (!isSearchable(inputValue.value)) return
  void fetchAndUpdate()
}

async function onSelect(match: AddressMatch) {
  const request = startRequest()
  inputValue.value = match.label
  closeFoldout()
  try {
    const place = await lookupPlace(match, request.signal)
    if (request.signal.aborted) return
    emit('select', place)
  } catch {
    if (request.signal.aborted) return
    unavailable.value = true
  } finally {
    if (inFlight === request) inFlight = null
  }
}

function setInputValue(value: string) {
  cancelPending()
  inputValue.value = value
  closeFoldout()
}

defineExpose({ setInputValue })
</script>

<template>
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
          role="combobox"
          aria-autocomplete="list"
          :aria-controls="listboxId"
          :aria-expanded="foldoutOpen"
          :aria-activedescendant="activeOptionId"
          @input="onInput"
          @keydown.enter="onEnter"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.esc="closeFoldout"
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
          <p
            v-else-if="unavailable"
            class="font-body text-caption px-3 py-2 text-ink-muted not-italic normal-case"
            data-testid="suggestions-unavailable"
            role="status"
          >
            Address search is unavailable. Click the map to choose a point.
          </p>
          <ul
            v-else-if="matches.length > 0"
            :id="listboxId"
            class="m-0 list-none p-0"
            data-testid="suggestions"
            role="listbox"
            aria-label="Places"
          >
            <li
              v-for="(match, index) in matches"
              :id="optionId(index)"
              :key="match.gid"
              class="font-body cursor-pointer border-b border-border px-3 py-2 text-[14px] text-ink not-italic normal-case transition-colors duration-200 ease-(--ease-smooth) last:border-b-0 hover:bg-surface aria-selected:bg-surface aria-selected:outline-2 aria-selected:-outline-offset-2 aria-selected:outline-coral"
              role="option"
              :aria-selected="index === activeIndex"
              @click="onSelect(match)"
            >
              {{ match.label }}
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
