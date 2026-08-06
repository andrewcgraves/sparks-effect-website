<script setup lang="ts">
import { computed } from 'vue'

// A range input restricted to a fixed set of values rather than a continuous
// span. The underlying <input> moves across option indices, but the model
// callers see and set is always one of `options` — the index never leaks out.
const props = withDefaults(
  defineProps<{
    modelValue: number
    options: number[]
    formatOption?: (value: number) => string
    testid?: string
  }>(),
  {
    formatOption: (value: number) => String(value),
    testid: 'stepped-slider',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const selectedIndex = computed(() => props.options.indexOf(props.modelValue))

function onInput(event: Event) {
  const index = Number((event.target as HTMLInputElement).value)
  emit('update:modelValue', props.options[index])
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <input
      type="range"
      class="accent-coral w-full"
      min="0"
      :max="options.length - 1"
      step="1"
      :value="selectedIndex"
      :aria-valuetext="formatOption(modelValue)"
      :data-testid="testid"
      @input="onInput"
    >
    <div class="font-body text-micro flex justify-between text-ink-muted">
      <span
        v-for="option in options"
        :key="option"
        :class="option === modelValue ? 'text-coral' : ''"
        :data-testid="`${testid}-option-${option}`"
      >
        {{ formatOption(option) }}
      </span>
    </div>
  </div>
</template>
