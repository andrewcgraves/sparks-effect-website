<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import { PRIMARY_BUTTON_CLASS } from '../buttonStyles'

const props = defineProps<{
  plot: object | null
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
  <button
    v-if="!open"
    ref="pill"
    type="button"
    :class="[PRIMARY_BUTTON_CLASS, 'absolute top-2.5 left-2.5 z-2 shadow-(--shadow-panel)']"
    data-testid="embed-plot-open"
    @click="open = true"
  >
    {{ plot ? 'Plot another' : 'Plot a splash zone' }}
  </button>
  <!-- v-show, not v-if: the form keeps what was typed while minimized, and the
       saved list has to stay mounted to have loaded. -->
  <div
    v-show="open"
    class="absolute top-2.5 left-2.5 z-2 flex max-h-[calc(100%-44px)] w-[320px] max-w-[calc(100%-20px)] flex-col rounded-(--radius-box) shadow-(--shadow-panel)"
    data-testid="embed-plot-card"
  >
    <button
      type="button"
      class="t-meta absolute top-3 right-3 z-1 cursor-pointer rounded-(--radius-field) px-2 py-1 text-ink-muted hover:bg-white"
      aria-label="Minimize the plot panel"
      data-testid="embed-plot-minimize"
      @click="minimize"
    >
      ✕
    </button>
    <div class="min-h-0 overflow-y-auto rounded-(--radius-box) [&>section]:border-0">
      <slot />
    </div>
  </div>
</template>
