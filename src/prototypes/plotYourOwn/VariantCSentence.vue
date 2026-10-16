<script setup lang="ts">
// PROTOTYPE (throwaway) — variant C: the form is one sentence.
// "Show where I can get to in [60 min] by [walking] from [starting point]."
// Each bracket is a control; the starting point opens an inline chooser.
// No field labels, no coordinates unless asked for.
import { ref, watch } from 'vue'
import AddressAutocomplete from '../../components/AddressAutocomplete.vue'
import { PRIMARY_BUTTON_CLASS } from '../../components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../../components/fieldStyles'
import { TRAVEL_MODES, type TravelMode } from '../../api/authoring/types'
import { usePlotFormState, type PlotFormEmit, type PlotFormProps } from './usePlotFormState'

const props = withDefaults(defineProps<PlotFormProps>(), {
  error: null, loading: false, offline: false, initial: () => ({}), framed: true,
})
const emit = defineEmits<PlotFormEmit>()
const s = usePlotFormState(props, emit)

const MODE_VERBS: Record<TravelMode, string> = {
  walk: 'walking',
  bike: 'bike',
  drive: 'car',
  transit: 'transit',
}

const chooserOpen = ref(!s.origin.value)
const showCoords = ref(false)
// A start chosen any way closes the chooser; the sentence now reads complete.
watch(s.origin, (o) => { if (o) chooserOpen.value = false })

const TOKEN_CLASS =
  'cursor-pointer appearance-none border-0 border-b-2 border-coral bg-transparent px-0.5 font-display text-coral hover:border-ink hover:text-ink focus-visible:outline-none'

defineExpose({ setOriginFromMap: s.setOriginFromMap, fill: s.fill })
</script>

<template>
  <form
    class="flex flex-col gap-4"
    @submit.prevent="s.submit"
  >
    <p class="font-body text-[20px] leading-[1.9] text-ink">
      Show everywhere I can reach in
      <select
        v-model.number="s.duration.value"
        :class="TOKEN_CLASS"
        aria-label="Travel time"
      >
        <option
          v-for="d in s.durationOptions.value"
          :key="d"
          :value="d"
        >
          {{ d }} min
        </option>
      </select>
      by
      <select
        :value="s.mode.value"
        :class="TOKEN_CLASS"
        aria-label="Mode"
        @change="s.setMode(($event.target as HTMLSelectElement).value as TravelMode)"
      >
        <option
          v-for="m in TRAVEL_MODES"
          :key="m"
          :value="m"
        >
          {{ MODE_VERBS[m] }}
        </option>
      </select>
      from
      <button
        type="button"
        :class="[TOKEN_CLASS, !s.origin.value && 'border-dashed text-ink-muted']"
        :aria-expanded="chooserOpen"
        @click="chooserOpen = !chooserOpen"
      >
        {{ s.origin.value ? s.originTitle.value : 'a starting point' }}
      </button>.
    </p>

    <div
      v-if="chooserOpen"
      class="flex flex-col gap-3 rounded-(--radius-field) border border-border bg-white p-3"
    >
      <div class="[&_label]:sr-only">
        <AddressAutocomplete
          :ref="(el) => { s.autocomplete.value = el as never }"
          @select="s.onAddressSelect"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="font-body text-caption cursor-pointer rounded-full border border-border px-3 py-1.5 text-ink hover:border-coral"
          :disabled="s.locating.value"
          @click="s.useMyLocation"
        >
          ◎ {{ s.locating.value ? 'Finding you…' : 'Use my location' }}
        </button>
        <button
          type="button"
          class="font-body text-caption cursor-pointer rounded-full border px-3 py-1.5"
          :class="s.pickArmed.value ? 'border-coral bg-coral text-white' : 'border-border text-ink hover:border-coral'"
          @click="s.pickArmed.value = !s.pickArmed.value"
        >
          📍 {{ s.pickArmed.value ? 'Tap the map… (cancel)' : 'Tap the map' }}
        </button>
        <button
          type="button"
          class="font-body text-caption cursor-pointer rounded-full border border-border px-3 py-1.5 text-ink-muted hover:border-coral"
          @click="showCoords = !showCoords"
        >
          Coordinates
        </button>
      </div>
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
      <p
        v-if="s.locationError.value"
        class="font-body text-caption text-error italic"
      >
        {{ s.locationError.value }}
      </p>
    </div>

    <button
      type="submit"
      :class="PRIMARY_BUTTON_CLASS"
      :disabled="!s.isValid.value || loading || offline"
    >
      {{ loading ? 'Plotting…' : 'Show me' }}
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
