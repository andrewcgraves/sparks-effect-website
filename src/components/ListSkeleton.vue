<script setup lang="ts">
import { LIST_CARD_FRAME_CLASS } from './linkStyles'
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'

const props = withDefaults(defineProps<{
  label?: string
  caption?: boolean
  background?: 'surface' | 'white'
}>(), { label: 'Loading', caption: true, background: 'surface' })

const CARD_COUNT = 3
const NAME_WIDTHS = ['w-1/2', 'w-2/3', 'w-2/5']
</script>

<template>
  <LoadingRegion :label="props.label">
    <ul class="flex flex-col gap-2">
      <li
        v-for="index in CARD_COUNT"
        :key="index"
        :class="[LIST_CARD_FRAME_CLASS, props.background === 'white' ? 'bg-white' : 'bg-surface']"
        data-testid="list-card-skeleton"
      >
        <SkeletonShape :class="NAME_WIDTHS[(index - 1) % NAME_WIDTHS.length]" />
        <SkeletonShape
          v-if="props.caption"
          class="text-micro w-1/4"
        />
      </li>
    </ul>
  </LoadingRegion>
</template>
