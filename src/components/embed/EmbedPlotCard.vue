<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import type { ChainResponse } from '../../fixtures/isochrone'
import SplashZoneKey from '../SplashZoneKey.vue'

const props = defineProps<{
  plot: ChainResponse | null
  error: string | null
  pickArmed: boolean
  startOpen: boolean
}>()

const open = ref(props.startOpen)
const pill = useTemplateRef<HTMLButtonElement>('pill')

// In a frame a few hundred pixels across the card covers much of the map, so
// it gets out of the way of whatever the visitor came to see: a splash zone
// drawn, or the map while a start is picked on it. A plot that failed opens it
// again, since the reason is written in the form.
watch(() => props.plot, (plot) => {
  if (plot) open.value = false
})

watch(() => props.error, (error) => {
  if (error) open.value = true
})

watch(() => props.pickArmed, (armed, wasArmed) => {
  if (armed) open.value = false
  else if (wasArmed) open.value = true
})

async function minimize(): Promise<void> {
  open.value = false
  await nextTick()
  pill.value?.focus()
}
</script>

<template>
  <!-- Styled as one of the map's own controls, which on the flush map are
       40px white buttons in the opposite corner, so the pill reads as part
       of the map rather than a call to action laid over it. -->
  <div
    v-if="!open"
    class="absolute top-2.5 left-2.5 z-2 flex max-w-[calc(100%-70px)] flex-col items-start gap-2.5"
  >
    <button
      ref="pill"
      type="button"
      class="t-meta flex h-10 cursor-pointer items-center gap-2 rounded-(--radius-field) bg-white px-3 text-ink shadow-(--shadow-panel) hover:brightness-95"
      data-testid="embed-plot-open"
      @click="open = true"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        class="size-[18px] shrink-0 fill-none stroke-current stroke-[1.75]"
      >
        <path d="M5 8l5 5 5-5" />
      </svg>
      <span>{{ plot ? 'Plot another' : 'Plot a splash zone' }}</span>
    </button>
    <SplashZoneKey
      v-if="plot"
      :isochrone-data="plot"
      data-testid="embed-plot-key"
    />
  </div>
  <!-- v-show, not v-if: the form keeps what was typed while minimized, and the
       saved list has to stay mounted to have loaded. -->
  <div
    v-show="open"
    class="absolute top-2.5 left-2.5 z-2 flex max-h-[calc(100%-44px)] w-[320px] max-w-[calc(100%-20px)] flex-col rounded-(--radius-box) shadow-(--shadow-panel)"
    data-testid="embed-plot-card"
  >
    <button
      type="button"
      class="absolute top-3 right-3 z-1 flex size-8 cursor-pointer items-center justify-center rounded-(--radius-field) text-ink-muted hover:bg-surface hover:text-ink"
      aria-label="Minimize the plot panel"
      data-testid="embed-plot-minimize"
      @click="minimize"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        class="size-[18px] fill-none stroke-current stroke-[1.75]"
      >
        <path d="M5 12l5-5 5 5" />
      </svg>
    </button>
    <div class="min-h-0 overflow-y-auto rounded-(--radius-box) [&>section]:border-0">
      <slot />
    </div>
  </div>
</template>
