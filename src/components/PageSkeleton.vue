<script setup lang="ts">
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'

const props = withDefaults(defineProps<{
  label?: string
  subtitle?: boolean
  sideLines?: number
  cards?: number
}>(), { label: 'Loading', subtitle: false, sideLines: 4, cards: 0 })
</script>

<template>
  <!-- Mirrors the detail pages' layout classes (title, map panel grid, card
       grid) so the page keeps its shape when the real content swaps in. -->
  <LoadingRegion :label="props.label">
    <div class="flex flex-col gap-2">
      <div class="font-display text-display flex h-[1lh] items-center">
        <SkeletonShape class="w-3/4 max-w-[480px]" />
      </div>
      <div
        v-if="props.subtitle"
        class="font-body text-micro flex h-[1lh] items-center"
      >
        <SkeletonShape class="w-32" />
      </div>
    </div>

    <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
      <SkeletonShape
        shape="block"
        class="h-[70vh] min-h-[70vh]"
        data-testid="map-panel-skeleton"
      />
      <SkeletonShape
        shape="card"
        :lines="props.sideLines"
      />
    </div>

    <div
      v-if="props.cards > 0"
      class="mt-8 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-4"
    >
      <SkeletonShape
        v-for="card in props.cards"
        :key="card"
        shape="card"
        data-testid="card-skeleton"
      />
    </div>
  </LoadingRegion>
</template>
