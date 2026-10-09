<script setup lang="ts" generic="T extends string | number">
withDefaults(
  defineProps<{
    modelValue: T
    options: readonly T[]
    label: string
    formatOption?: (value: T) => string
    name?: string
    testid?: string
  }>(),
  {
    formatOption: (value: T) => String(value),
    name: 'segmented-control',
    testid: 'segmented-control',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()
</script>

<template>
  <div
    class="inline-flex flex-wrap gap-1 rounded-(--radius-selector) border border-border bg-surface p-1"
    role="radiogroup"
    :aria-label="label"
    :data-testid="testid"
  >
    <label
      v-for="option in options"
      :key="option"
      class="font-body text-caption cursor-pointer rounded-(--radius-selector) px-3 py-1.5 not-italic normal-case transition-colors duration-200 ease-(--ease-smooth) has-focus-visible:outline-(length:--focus-ring-width) has-focus-visible:outline-offset-(--focus-ring-offset) has-focus-visible:outline-focus"
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
