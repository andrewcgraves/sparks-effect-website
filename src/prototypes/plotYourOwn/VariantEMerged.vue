<script setup lang="ts">
// PROTOTYPE (throwaway) — variant E: B's starting-point field + D's emoji
// mode tiles, B's travel-time buttons and B's button that states the plot.
import { ref } from 'vue'
import AddressAutocomplete from '../../components/AddressAutocomplete.vue'
import SegmentedControl from '../../components/SegmentedControl.vue'
import { PRIMARY_BUTTON_CLASS } from '../../components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../../components/fieldStyles'
import { TRAVEL_MODES, type TravelMode } from '../../api/authoring/types'
import { MODE_LABELS, MODE_TRIPS } from '../../copy/modes'
import { usePlotFormState, type PlotFormEmit, type PlotFormProps } from './usePlotFormState'

const props = withDefaults(defineProps<PlotFormProps>(), {
  error: null, loading: false, offline: false, initial: () => ({}), framed: true,
})
const emit = defineEmits<PlotFormEmit>()
const s = usePlotFormState(props, emit)
const showCoords = ref(false)

const MODE_ICONS: Record<TravelMode, string> = { walk: '🚶', bike: '🚲', drive: '🚗', transit: '🚆' }

const formatMinutes = (v: number) => `${v} min`

defineExpose({ setOriginFromMap: s.setOriginFromMap, fill: s.fill })
</script>

<template>
  <form
    class="flex flex-col gap-5"
    @submit.prevent="s.submit"
  >
    <div class="flex flex-col gap-1.5">
      <span :class="FIELD_LABEL_CLASS">Starting point</span>

      <!-- Set: a card naming the start, with one way back to choosing. -->
      <div
        v-if="s.origin.value && !s.pickArmed.value"
        class="flex items-center gap-3 rounded-(--radius-field) border border-coral/60 bg-white px-3 py-2"
      >
        <span
          aria-hidden="true"
          class="text-lg"
        >📍</span>
        <div class="min-w-0 flex-1">
          <p class="font-body truncate text-[14px] text-ink">
            {{ s.originTitle.value }}
          </p>
          <p class="font-body text-micro text-ink-muted">
            {{ s.coordsText.value }}
          </p>
        </div>
        <button
          type="button"
          class="font-display text-btn cursor-pointer text-ink-muted uppercase hover:text-coral"
          @click="s.clearOrigin"
        >
          Change
        </button>
      </div>

      <!-- Picking on the map: the field says so, and nothing else competes. -->
      <div
        v-else-if="s.pickArmed.value"
        class="flex items-center gap-3 rounded-(--radius-field) border border-dashed border-coral bg-coral/5 px-3 py-2.5"
      >
        <span
          aria-hidden="true"
          class="animate-pulse text-lg"
        >📍</span>
        <p class="font-body flex-1 text-[14px] text-ink">
          Tap the map where you want to start
        </p>
        <button
          type="button"
          class="font-display text-btn cursor-pointer text-ink-muted uppercase hover:text-coral"
          @click="s.pickArmed.value = false"
        >
          Cancel
        </button>
      </div>

      <!-- Unset: search first, the other two methods beside it. -->
      <template v-else>
        <div class="[&_label]:sr-only">
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
              <button
                type="button"
                class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-field) border border-border bg-white hover:border-coral"
                aria-label="Pick on the map"
                title="Pick on the map"
                @click="s.pickArmed.value = true"
              >
                📍
              </button>
            </template>
          </AddressAutocomplete>
        </div>
        <button
          type="button"
          class="font-body text-caption self-start text-ink-muted underline hover:text-coral"
          @click="showCoords = !showCoords"
        >
          {{ showCoords ? 'Hide coordinates' : 'Enter coordinates instead' }}
        </button>
        <div
          v-if="showCoords"
          class="grid grid-cols-2 gap-3"
        >
          <label :class="FIELD_LABEL_CLASS">
            Latitude
            <input
              v-model="s.lat.value"
              :class="FIELD_INPUT_CLASS"
              type="number"
              step="any"
              @change="s.originSource.value = 'coords'"
            >
          </label>
          <label :class="FIELD_LABEL_CLASS">
            Longitude
            <input
              v-model="s.lng.value"
              :class="FIELD_INPUT_CLASS"
              type="number"
              step="any"
              @change="s.originSource.value = 'coords'"
            >
          </label>
        </div>
      </template>
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
            name="proto-e-mode"
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

    <div :class="FIELD_LABEL_CLASS">
      <span>For up to</span>
      <SegmentedControl
        v-model="s.duration.value"
        :options="s.durationOptions.value"
        :format-option="formatMinutes"
        label="Travel time"
        name="proto-e-duration"
      />
    </div>


    <button
      type="submit"
      :class="PRIMARY_BUTTON_CLASS"
      :disabled="!s.isValid.value || loading || offline"
    >
      <template v-if="loading">
        Plotting…
      </template>
      <template v-else-if="!s.isValid.value">
        Choose a starting point first
      </template>
      <template v-else>
        Plot a {{ s.duration.value }}-min {{ MODE_TRIPS[s.mode.value] }}
      </template>
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
