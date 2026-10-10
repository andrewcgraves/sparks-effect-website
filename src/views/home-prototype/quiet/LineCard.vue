<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. The one line card the quiet variants share.
// A grey panel, the route drawn from geometry, the name and one line of
// subtext. `layout` stacks the drawing above the text or puts it beside it;
// nothing else changes between the two.
import type { FeaturedLine } from '../homePrototypeData'
import RouteThumb from '../RouteThumb.vue'

withDefaults(defineProps<{ line: FeaturedLine; layout?: 'stacked' | 'row' }>(), { layout: 'stacked' })
</script>

<template>
  <router-link
    :to="line.to"
    class="group block overflow-hidden rounded-(--radius-box) bg-surface transition-colors duration-200 ease-(--ease-smooth) hover:bg-[#ebebee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    :class="layout === 'row' && 'grid grid-cols-[128px_1fr] items-center'"
  >
    <RouteThumb
      :line="line"
      :width="layout === 'row' ? 128 : 320"
      :height="layout === 'row' ? 96 : 180"
      class="w-full"
    />
    <span
      class="flex flex-col gap-1"
      :class="layout === 'row' ? 'px-4 py-3' : 'px-4 pt-3 pb-4'"
    >
      <span class="font-display text-h3 text-ink-true group-hover:text-coral">{{ line.name }}</span>
      <span class="font-body text-caption line-clamp-2 text-ink-muted">{{ line.caption }}</span>
    </span>
  </router-link>
</template>
