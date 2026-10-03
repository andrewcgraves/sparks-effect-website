<script setup lang="ts">
const props = withDefaults(defineProps<{
  shape?: 'block' | 'line' | 'card'
  lines?: number
}>(), { shape: 'line', lines: 3 })

const LINE_WIDTHS = ['w-full', 'w-5/6', 'w-2/3']
</script>

<template>
  <div
    v-if="props.shape === 'card'"
    class="rounded-(--radius-box) border border-border bg-surface p-4"
    aria-hidden="true"
  >
    <div
      class="skeleton h-6 w-2/5 rounded-(--radius-field)"
      data-skeleton-part="heading"
    />
    <div class="mt-3 flex flex-col gap-2">
      <div
        v-for="index in props.lines"
        :key="index"
        :class="['skeleton h-4 rounded-(--radius-field)', LINE_WIDTHS[(index - 1) % LINE_WIDTHS.length]]"
        data-skeleton-part="line"
      />
    </div>
  </div>
  <div
    v-else
    :class="['skeleton', props.shape === 'block' ? 'rounded-(--radius-box)' : 'h-[1em] rounded-(--radius-field)']"
    aria-hidden="true"
  />
</template>
