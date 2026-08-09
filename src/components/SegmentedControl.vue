<script setup lang="ts">
// A single-choice control rendered as a row of pill segments rather than a
// continuous track — reads better than a slider once the option count/labels
// get a little busy. Built on native radio inputs (visually hidden behind the
// pill labels) so grouping, keyboard nav, and labelling all come for free.
withDefaults(
  defineProps<{
    modelValue: number
    options: number[]
    formatOption?: (value: number) => string
    name?: string
    testid?: string
  }>(),
  {
    formatOption: (value: number) => String(value),
    name: 'segmented-control',
    testid: 'segmented-control',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()
</script>

<template>
  <div
    class="inline-flex flex-wrap gap-1 rounded-(--radius-selector) border border-border bg-surface p-1"
    :data-testid="testid"
  >
    <label
      v-for="option in options"
      :key="option"
      class="font-body text-caption cursor-pointer rounded-(--radius-selector) px-3 py-1.5 not-italic normal-case transition-colors duration-200 ease-(--ease-smooth)"
      :class="option === modelValue ? 'bg-coral text-white' : 'text-ink-muted hover:text-ink'"
    >
      <input
        type="radio"
        :name="name"
        class="sr-only"
        :value="option"
        :checked="option === modelValue"
        :data-testid="`${testid}-option-${option}`"
        @change="emit('update:modelValue', option)"
      >
      {{ formatOption(option) }}
    </label>
  </div>
</template>
