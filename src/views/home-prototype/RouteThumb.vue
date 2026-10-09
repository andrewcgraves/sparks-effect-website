<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. A line's alignment drawn as SVG from its
// geometry: no tiles, no MapLibre, a few hundred bytes per card.
import { computed } from 'vue'
import type { FeaturedLine } from './homePrototypeData'
import { projector } from './svgProjection'

const props = withDefaults(defineProps<{ line: FeaturedLine; width?: number; height?: number; labels?: boolean }>(), {
  width: 240,
  height: 150,
  labels: false,
})

const view = computed(() => {
  const all = [...props.line.paths.flat(), ...props.line.stations.map((s) => s.at)]
  if (all.length < 2) return null
  return projector(all, props.width, props.height, props.labels ? 28 : 14)
})

const ends = computed(() => {
  const s = props.line.stations
  return s.length ? [s[0], s[s.length - 1]] : []
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    class="block h-auto max-w-full"
    role="img"
    :aria-label="`Map of ${line.name}`"
  >
    <rect
      :width="width"
      :height="height"
      class="fill-surface"
    />
    <template v-if="view">
      <path
        v-for="(p, i) in line.paths"
        :key="i"
        :d="view.path(p)"
        class="fill-none stroke-ink"
        stroke-width="3"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <circle
        v-for="s in line.stations"
        :key="s.name"
        :cx="view.project(s.at)[0]"
        :cy="view.project(s.at)[1]"
        r="3.5"
        class="fill-white stroke-ink"
        stroke-width="2"
      />
      <template v-if="labels">
        <text
          v-for="s in ends"
          :key="`l-${s.name}`"
          :x="view.project(s.at)[0] + 8"
          :y="view.project(s.at)[1] + 4"
          class="fill-ink-muted font-body"
          font-size="11"
        >{{ s.name }}</text>
      </template>
    </template>
    <text
      v-else
      :x="width / 2"
      :y="height / 2"
      text-anchor="middle"
      class="fill-ink-muted font-body"
      font-size="11"
    >No geometry in the published index</text>
  </svg>
</template>
