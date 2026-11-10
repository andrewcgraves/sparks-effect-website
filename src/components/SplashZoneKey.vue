<script setup lang="ts">
import { computed } from 'vue'
import { isochroneLegend } from '../composables/useIsochroneLayer'
import { originWalkLine } from '../composables/useOriginWalkLayer'
import type { ChainResponse } from '../fixtures/isochrone'
import KeySwatch from './KeySwatch.vue'

const props = defineProps<{ isochroneData: ChainResponse | null }>()

const legend = computed(() =>
  isochroneLegend({
    unfinished: (props.isochroneData?.metadata.trip_progress?.length ?? 0) > 0,
    starterWalk: originWalkLine(props.isochroneData) !== null,
  }),
)
</script>

<template>
  <aside
    class="rounded-(--radius-field) bg-white/92 px-3 py-2.5 shadow-(--shadow-panel)"
    aria-label="Splash zone color key"
  >
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
      <li
        v-for="entry in legend"
        :key="entry.source"
        class="t-meta flex items-center gap-2 text-ink"
      >
        <KeySwatch
          :kind="entry.source"
          class="shrink-0"
          :data-testid="`legend-swatch-${entry.source}`"
        />
        <span>{{ entry.label }}</span>
      </li>
    </ul>
  </aside>
</template>
