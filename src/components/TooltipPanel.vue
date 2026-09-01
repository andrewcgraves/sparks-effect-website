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
    // When a boolean is passed, the caller owns visibility. Time remaining
    // does, because a row being active also lights the map, and those two
    // facts have to stay one fact. Leave it null and the trigger's own hover
    // and focus decide. null rather than undefined: Vue casts a Boolean prop
    // that was not passed to false, which would look like a closed caller.
    open?: boolean | null
    // The element the box is measured off. Defaults to the trigger. Callers
    // that open from somewhere other than the trigger — a map hover scrolling
    // a row into view — pass the element that should own the box.
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

// display:contents takes the wrapper out of layout so wrapping a block-level
// trigger does not shrink it. The wrapper's own box is then empty, so the
// trigger's first child is what we measure.
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
  <!-- The box is fixed rather than laid out next to the trigger, so opening
       it cannot resize whatever the trigger sits in — a list that used to
       reflow under the pointer, a rail that would shove its neighbours.
       Fixed also escapes an ancestor's overflow, which would otherwise clip
       the box on the last few rows of a scrolling card. -->
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
