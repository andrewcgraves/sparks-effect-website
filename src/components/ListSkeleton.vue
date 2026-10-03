<script setup lang="ts">
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'

const props = withDefaults(defineProps<{
  label?: string
  count?: number
  caption?: boolean
  surface?: 'surface' | 'white'
}>(), { label: 'Loading', count: 3, caption: true, surface: 'surface' })

const NAME_WIDTHS = ['w-1/2', 'w-2/3', 'w-2/5']
</script>

<template>
  <LoadingRegion :label="props.label">
    <ul class="flex flex-col gap-2">
      <!-- Same frame and type as a loaded card, with each bar sitting in one
           line box, so the list holds its height when the real cards land. -->
      <li
        v-for="index in props.count"
        :key="index"
        :class="[
          'font-body text-body flex flex-col gap-1 rounded-(--radius-field) border border-border px-3 py-2',
          props.surface === 'white' ? 'bg-white' : 'bg-surface',
        ]"
        data-testid="list-card-skeleton"
      >
        <span class="flex h-[1lh] items-center">
          <SkeletonShape :class="NAME_WIDTHS[(index - 1) % NAME_WIDTHS.length]" />
        </span>
        <span
          v-if="props.caption"
          class="text-micro flex h-[1lh] items-center"
        >
          <SkeletonShape class="w-1/4" />
        </span>
      </li>
    </ul>
  </LoadingRegion>
</template>
