<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { VehicleParams } from '../api/authoring/types'
import FieldNote from './FieldNote.vue'
import SegmentedControl from './SegmentedControl.vue'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from './fieldStyles'
import {
  VEHICLE_PRESETS,
  kmhToMph,
  matchingPreset,
  mphToKmh,
  presetVehicle,
  vehicleFieldHelp,
  vehicleWarnings,
  type SpeedUnit,
  type VehiclePresetId,
} from './vehiclePresets'

const props = defineProps<{ modelValue: VehicleParams }>()

const emit = defineEmits<{
  'update:modelValue': [value: VehicleParams]
}>()

const PRESET_IDS = VEHICLE_PRESETS.map((preset) => preset.id)
const PRESET_LABELS = Object.fromEntries(VEHICLE_PRESETS.map((preset) => [preset.id, preset.label])) as Record<
  VehiclePresetId,
  string
>

// The chosen preset is never stored: it is read back off the four values, so a
// saved service shows the preset it equals, and a single edited digit turns it
// to Custom without anything having to be reset.
const preset = computed({
  get: () => matchingPreset(props.modelValue),
  set: (id: VehiclePresetId | null) => {
    if (id) emit('update:modelValue', presetVehicle(id))
  },
})

const presetLabel = computed(() => (preset.value ? PRESET_LABELS[preset.value] : 'Custom'))

function field(name: Exclude<keyof VehicleParams, 'max_speed_kmh'>) {
  return computed({
    get: () => props.modelValue[name],
    set: (value: number) => emit('update:modelValue', { ...props.modelValue, [name]: value }),
  })
}

const acceleration = field('acceleration_ms2')
const deceleration = field('deceleration_ms2')
const dwell = field('dwell_s')

const SPEED_UNITS: readonly SpeedUnit[] = ['kmh', 'mph']
const SPEED_UNIT_LABELS: Record<SpeedUnit, string> = { kmh: 'km/h', mph: 'mph' }

const speedUnit = ref<SpeedUnit>('kmh')

// Display only: the draft, and so the payload, holds km/h whichever unit the
// author reads and types in.
const maxSpeed = computed({
  get: () =>
    speedUnit.value === 'mph' ? kmhToMph(props.modelValue.max_speed_kmh) : props.modelValue.max_speed_kmh,
  set: (value: number) =>
    emit('update:modelValue', {
      ...props.modelValue,
      max_speed_kmh: speedUnit.value === 'mph' ? mphToKmh(value) : value,
    }),
})

const warnings = computed(() => vehicleWarnings(props.modelValue))

const speedInputId = useId()
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <SegmentedControl
        v-model="preset"
        :options="PRESET_IDS"
        :format-option="(id: VehiclePresetId) => PRESET_LABELS[id]"
        name="vehicle-preset"
        testid="vehicle-preset"
      />
      <span
        class="font-body text-caption text-ink-muted"
        data-testid="vehicle-preset-label"
      >{{ presetLabel }}</span>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label
            :class="FIELD_LABEL_CLASS"
            :for="speedInputId"
            data-testid="vehicle-max-speed-label"
          >Max speed ({{ SPEED_UNIT_LABELS[speedUnit] }})</label>
          <SegmentedControl
            v-model="speedUnit"
            :options="SPEED_UNITS"
            :format-option="(unit: SpeedUnit) => SPEED_UNIT_LABELS[unit]"
            name="vehicle-speed-unit"
            testid="vehicle-speed-unit"
          />
        </div>
        <input
          :id="speedInputId"
          v-model.number="maxSpeed"
          :class="FIELD_INPUT_CLASS"
          data-testid="vehicle-max-speed"
          type="number"
          min="0"
          step="any"
        >
        <FieldNote
          :help="vehicleFieldHelp('max_speed_kmh', speedUnit)"
          :warning="warnings.max_speed_kmh"
          testid="vehicle-max-speed"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label :class="FIELD_LABEL_CLASS">
          Acceleration (m/s²)
          <input
            v-model.number="acceleration"
            :class="FIELD_INPUT_CLASS"
            data-testid="vehicle-acceleration"
            type="number"
            min="0"
            step="0.1"
          >
        </label>
        <FieldNote
          :help="vehicleFieldHelp('acceleration_ms2', speedUnit)"
          :warning="warnings.acceleration_ms2"
          testid="vehicle-acceleration"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label :class="FIELD_LABEL_CLASS">
          Deceleration (m/s²)
          <input
            v-model.number="deceleration"
            :class="FIELD_INPUT_CLASS"
            data-testid="vehicle-deceleration"
            type="number"
            min="0"
            step="0.1"
          >
        </label>
        <FieldNote
          :help="vehicleFieldHelp('deceleration_ms2', speedUnit)"
          :warning="warnings.deceleration_ms2"
          testid="vehicle-deceleration"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label :class="FIELD_LABEL_CLASS">
          Dwell (s)
          <input
            v-model.number="dwell"
            :class="FIELD_INPUT_CLASS"
            data-testid="vehicle-dwell"
            type="number"
            min="0"
          >
        </label>
        <FieldNote
          :help="vehicleFieldHelp('dwell_s', speedUnit)"
          :warning="warnings.dwell_s"
          testid="vehicle-dwell"
        />
      </div>
    </div>
  </div>
</template>
