<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, useSlots, watch } from 'vue'
import {
  placeTooltip,
  tooltipStyle,
  TOOLTIP_LAYER_CLASS,
  TOOLTIP_PANEL_CLASS,
  TOOLTIP_WIDTH_PX,
} from './tooltip'

defineOptions({ name: 'TooltipPanel' })

const props = withDefaults(
  defineProps<{
    open?: boolean | null
    anchor?: Element | null
    width?: number
  }>(),
  {
    open: null,
    width: TOOLTIP_WIDTH_PX,
    anchor: null,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const slots = useSlots()
const tooltipId = useId()
const triggerEl = ref<HTMLElement | null>(null)
const internalOpen = ref(false)

const controlled = computed(() => props.open !== null)
const visible = computed(() => (controlled.value ? Boolean(props.open) : internalOpen.value))
const hasTrigger = computed(() => Boolean(slots.trigger))

function setOpen(value: boolean): void {
  if (!controlled.value) internalOpen.value = value
  emit('update:open', value)
}

function onOpen(): void {
  setOpen(true)
}

function onClose(): void {
  setOpen(false)
}

function triggerAnchor(): Element | null {
  return triggerEl.value?.firstElementChild ?? triggerEl.value
}

const tipStyle = ref<Record<string, string>>({})
let listening = false

function reposition(): void {
  const target = props.anchor ?? triggerAnchor()
  if (!target || !visible.value) return
  const rect = target.getBoundingClientRect()
  tipStyle.value = tooltipStyle(
    placeTooltip(
      { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      { width: window.innerWidth, height: window.innerHeight },
      props.width,
    ),
  )
}

function startListening(): void {
  if (listening) return
  listening = true
  // Captured because the anchor often scrolls in a box of its own (the Time
  // remaining list) rather than on the window.
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
}

function stopListening(): void {
  if (!listening) return
  listening = false
  window.removeEventListener('scroll', reposition, true)
  window.removeEventListener('resize', reposition)
}

watch(
  () => [visible.value, props.anchor, props.width] as const,
  ([isOpen]) => {
    if (!isOpen) {
      stopListening()
      return
    }
    startListening()
    void nextTick(reposition)
  },
  { immediate: true },
)

onBeforeUnmount(stopListening)
</script>

<template>
  
  <span
    v-if="hasTrigger"
    ref="triggerEl"
    class="contents"
    data-testid="tooltip-trigger"
    @mouseenter="onOpen"
    @mouseleave="onClose"
    @focusin="onOpen"
    @focusout="onClose"
  >
    <slot name="trigger" />
  </span>
  <div
    v-if="visible"
    :id="tooltipId"
    :class="[TOOLTIP_LAYER_CLASS, TOOLTIP_PANEL_CLASS]"
    :style="tipStyle"
    role="tooltip"
    data-testid="tooltip"
  >
    <slot />
  </div>
</template>
