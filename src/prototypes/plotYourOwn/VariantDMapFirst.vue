<script setup lang="ts">
// PROTOTYPE (throwaway) — variant D: map first, tiles and a slider.
// The map is the main way to choose a start (a big toggle), search is the
// fallback. Mode is four icon tiles; travel time is one slider with a large
// readout. No coordinates at all — the dropped pin is the coordinate.
import { computed } from 'vue'
import AddressAutocomplete from '../../components/AddressAutocomplete.vue'
import { PLACEMENT_TOGGLE_CLASS, PRIMARY_BUTTON_CLASS } from '../../components/buttonStyles'
import { FIELD_LABEL_CLASS } from '../../components/fieldStyles'
import { TRAVEL_MODES, type TravelMode } from '../../api/authoring/types'
import { MODE_LABELS } from '../../copy/modes'
import { usePlotFormState, type PlotFormEmit, type PlotFormProps } from './usePlotFormState'

const props = withDefaults(defineProps<PlotFormProps>(), {
  error: null, loading: false, offline: false, initial: () => ({}), framed: true,
})
const emit = defineEmits<PlotFormEmit>()
const s = usePlotFormState(props, emit)

const MODE_ICONS: Record<TravelMode, string> = { walk: '🚶', bike: '🚲', drive: '🚗', transit: '🚆' }

const durationIndex = computed({
  get: () => Math.max(0, s.durationOptions.value.indexOf(s.duration.value)),
  set: (i: number) => { s.duration.value = s.durationOptions.value[i] ?? s.duration.value },
})

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

defineExpose({ setOriginFromMap: s.setOriginFromMap, fill: s.fill })
</script>

<template>
  <form
    class="flex flex-col gap-5"
    @submit.prevent="s.submit"
  >
    <div class="flex flex-col gap-2">
      <button
        type="button"
        :class="PLACEMENT_TOGGLE_CLASS"
        :aria-pressed="s.pickArmed.value"
        class="flex items-center justify-center gap-2 py-4!"
        @click="s.pickArmed.value = !s.pickArmed.value"
      >
        <span aria-hidden="true">📍</span>
        <template v-if="s.pickArmed.value">
          Tap the map · Esc to cancel
        </template>
        <template v-else-if="s.origin.value">
          Move the starting pin
        </template>
        <template v-else>
          Tap the map to start
        </template>
      </button>
      <p
        v-if="s.origin.value"
        class="font-body text-caption text-center text-ink-muted"
      >
        Starting from <span class="text-ink">{{ s.originTitle.value }}</span>
      </p>

      <details class="group">
        <summary class="font-body text-caption cursor-pointer list-none text-center text-ink-muted underline hover:text-coral">
          or search for a place
        </summary>
        <div class="mt-2 [&_label]:sr-only">
          <AddressAutocomplete
            :ref="(el) => { s.autocomplete.value = el as never }"
            @select="s.onAddressSelect"
          >
            <template #trailing>
              <button
                type="button"
                class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-field) border border-border bg-white text-ink-muted hover:border-coral hover:text-coral"
                aria-label="Use my location"
                title="Use my location"
                :disabled="s.locating.value"
                @click="s.useMyLocation"
              >
                <span :class="{ 'animate-pulse': s.locating.value }">◎</span>
              </button>
            </template>
          </AddressAutocomplete>
        </div>
      </details>
      <p
        v-if="s.locationError.value"
        class="font-body text-caption text-error italic"
      >
        {{ s.locationError.value }}
      </p>
    </div>

    <fieldset class="flex flex-col gap-2 border-0 p-0">
      <legend :class="FIELD_LABEL_CLASS">
        Getting around by
      </legend>
      <div class="grid grid-cols-4 gap-2">
        <label
          v-for="m in TRAVEL_MODES"
          :key="m"
          class="flex cursor-pointer flex-col items-center gap-1 rounded-(--radius-field) border py-2.5 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-coral"
          :class="s.mode.value === m ? 'border-coral bg-coral/10 text-ink' : 'border-border bg-white text-ink-muted hover:border-ink-faint'"
        >
          <input
            type="radio"
            name="proto-d-mode"
            class="sr-only"
            :checked="s.mode.value === m"
            @change="s.setMode(m)"
          >
          <span
            aria-hidden="true"
            class="text-2xl"
          >{{ MODE_ICONS[m] }}</span>
          <span class="font-body text-caption">{{ MODE_LABELS[m] }}</span>
        </label>
      </div>
    </fieldset>

    <label class="flex flex-col gap-1">
      <span class="flex items-baseline justify-between">
        <span :class="FIELD_LABEL_CLASS">How far, in time</span>
        <span class="font-display text-h3 text-ink-true">{{ formatDuration(s.duration.value) }}</span>
      </span>
      <input
        v-model.number="durationIndex"
        type="range"
        min="0"
        :max="s.durationOptions.value.length - 1"
        step="1"
        class="accent-coral"
        aria-label="Travel time"
        :aria-valuetext="formatDuration(s.duration.value)"
      >
      <span class="font-body text-micro flex justify-between text-ink-muted">
        <span
          v-for="d in s.durationOptions.value"
          :key="d"
        >{{ d < 60 ? `${d}m` : `${+(d / 60).toFixed(2)}h` }}</span>
      </span>
    </label>

    <button
      type="submit"
      :class="PRIMARY_BUTTON_CLASS"
      :disabled="!s.isValid.value || loading || offline"
    >
      {{ loading ? 'Plotting…' : 'Plot splash zone' }}
    </button>

    <p
      v-if="s.showError.value"
      class="font-body text-caption text-error"
      role="alert"
    >
      {{ error }}
    </p>
  </form>
</template>
