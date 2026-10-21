<script setup lang="ts">
import { ref, watch } from 'vue'
import Notice from './Notice.vue'
import SegmentedControl from './SegmentedControl.vue'

type PlotSource = 'plot' | 'saved'

const props = defineProps<{
  hasSaved: boolean | null
  offline: boolean
}>()

const SOURCE_LABELS: Record<PlotSource, string> = {
  plot: 'Plot your own',
  saved: 'Saved splash zones',
}

const source = ref<PlotSource>('plot')

// With routing offline the saved splash zones are the only answer the panel
// can give, so it turns to them, whether routing dropped before or after the
// list arrived. Coming back online leaves the visitor where they are.
watch(
  () => props.offline && props.hasSaved === true,
  (savedOnly) => {
    if (savedOnly) source.value = 'saved'
  },
  { immediate: true },
)
</script>

<template>
  <section
    class="flex flex-col gap-4 rounded-(--radius-box) border border-border bg-surface p-4"
    data-testid="plot-panel"
  >
    <h2 class="font-display text-h3 text-ink-true">
      Plot a splash zone
    </h2>

    <SegmentedControl
      v-if="hasSaved"
      v-model="source"
      :options="['plot', 'saved'] as const"
      :format-option="(value: PlotSource) => SOURCE_LABELS[value]"
      label="Plot a splash zone from"
      name="plot-source"
      testid="plot-source"
      class="self-start"
    />

    <!-- Both stay mounted: the form keeps what was typed, and the saved list
         has to load before the panel knows whether to offer it. -->
    <div
      v-show="!hasSaved || source === 'plot'"
      data-testid="plot-own"
    >
      <Notice
        v-if="hasSaved && offline"
        tone="caution"
        size="inline"
        data-testid="plot-unavailable"
      >
        Plotting your own splash zone isn’t available right now.
      </Notice>
      <div v-show="!(hasSaved && offline)">
        <slot name="plot" />
      </div>
    </div>
    <div
      v-show="hasSaved && source === 'saved'"
      data-testid="plot-saved"
    >
      <slot name="saved" />
    </div>
  </section>
</template>
