<script setup lang="ts">
// PROTOTYPE (SPA-429) — throwaway. A bottom sheet with snap points, built on
// pointer events and a height transition, no library. Snap values <= 1 are a
// fraction of the space below `topOffset`; larger values are pixels.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    snaps: number[]
    topOffset?: number
    label?: string
  }>(),
  { topOffset: 0, label: 'panel' },
)

const snapIndex = defineModel<number>({ default: 0 })

const viewport = ref(window.innerHeight)
function onResize() {
  viewport.value = window.innerHeight
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

const available = computed(() => viewport.value - props.topOffset)
const snapPx = computed(() => props.snaps.map((s) => (s <= 1 ? Math.round(s * available.value) : s)))

const dragHeight = ref<number | null>(null)
const height = computed(() => dragHeight.value ?? snapPx.value[snapIndex.value] ?? 0)

let startY = 0
let startH = 0
let lastY = 0
let lastT = 0
let velocity = 0
let dragged = false

function onPointerDown(event: PointerEvent) {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  startY = lastY = event.clientY
  lastT = event.timeStamp
  startH = height.value
  velocity = 0
  dragged = false
  dragHeight.value = startH
}

function onPointerMove(event: PointerEvent) {
  if (dragHeight.value === null) return
  const dy = startY - event.clientY
  if (Math.abs(dy) > 4) dragged = true
  const min = snapPx.value[0] ?? 0
  const max = snapPx.value[snapPx.value.length - 1] ?? available.value
  dragHeight.value = Math.min(max, Math.max(min * 0.8, startH + dy))
  const dt = event.timeStamp - lastT
  if (dt > 0) velocity = (lastY - event.clientY) / dt
  lastY = event.clientY
  lastT = event.timeStamp
}

function onPointerUp() {
  if (dragHeight.value === null) return
  if (dragged) {
    // Fling bias: a quick flick goes one snap in its direction even if it
    // didn't travel past the halfway mark.
    const projected = dragHeight.value + velocity * 180
    let best = 0
    snapPx.value.forEach((px, i) => {
      if (Math.abs(px - projected) < Math.abs((snapPx.value[best] ?? 0) - projected)) best = i
    })
    snapIndex.value = best
  }
  dragHeight.value = null
}

// Tap / Enter / Space on the handle steps up through the snaps, then back to
// the first. A drag that just ended is not also a tap.
function onHandleClick() {
  if (dragged) {
    dragged = false
    return
  }
  snapIndex.value = (snapIndex.value + 1) % props.snaps.length
}

const expanded = computed(() => snapIndex.value > 0)
const nextLabel = computed(() =>
  snapIndex.value === props.snaps.length - 1 ? `Collapse ${props.label}` : `Expand ${props.label}`,
)
</script>

<template>
  <section
    class="fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-border bg-white shadow-[0_-4px_24px_rgb(0_0_0/0.14)]"
    :class="dragHeight === null ? 'transition-[height] duration-300 ease-(--ease-smooth)' : ''"
    :style="{ height: `${height}px` }"
    :aria-label="label"
  >
    <div class="shrink-0">
      <button
        type="button"
        class="flex w-full cursor-grab touch-none justify-center pt-2.5 pb-2 select-none active:cursor-grabbing"
        :aria-expanded="expanded"
        :aria-label="nextLabel"
        data-testid="sheet-handle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @click="onHandleClick"
      >
        <span class="h-1.5 w-10 rounded-full bg-placeholder" />
      </button>
    </div>
    <slot name="header" />
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <slot />
    </div>
  </section>
</template>
