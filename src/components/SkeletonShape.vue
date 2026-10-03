<script setup lang="ts">
const props = withDefaults(defineProps<{
  shape?: 'block' | 'line' | 'card'
  lines?: number
}>(), { shape: 'line', lines: 3 })

// Lines and the card's rows are one line box of the surrounding type (h-[1lh]
// around a 1em bar), so a skeleton is exactly as tall as the text it stands in
// for. A comment at the template root would make this a fragment and stop the
// caller's classes falling through, hence here.
const LINE_WIDTHS = ['w-full', 'w-5/6', 'w-2/3']
</script>

<template>
  <div
    v-if="props.shape === 'card'"
    class="rounded-(--radius-box) border border-border bg-surface p-4"
    aria-hidden="true"
  >
    <div
      class="font-display text-h3 flex h-[1lh] items-center"
      data-skeleton-part="heading"
    >
      <span class="skeleton h-[1em] w-2/5 rounded-(--radius-field)" />
    </div>
    <div class="font-body text-caption mt-3 flex flex-col gap-2">
      <div
        v-for="index in props.lines"
        :key="index"
        class="flex h-[1lh] items-center"
        data-skeleton-part="line"
      >
        <span :class="['skeleton h-[1em] rounded-(--radius-field)', LINE_WIDTHS[(index - 1) % LINE_WIDTHS.length]]" />
      </div>
    </div>
  </div>
  <div
    v-else-if="props.shape === 'block'"
    class="skeleton rounded-(--radius-box)"
    aria-hidden="true"
  />
  <div
    v-else
    class="flex h-[1lh] items-center"
    aria-hidden="true"
  >
    <span class="skeleton h-[1em] w-full rounded-(--radius-field)" />
  </div>
</template>
