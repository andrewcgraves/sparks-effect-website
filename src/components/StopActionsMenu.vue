<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

const props = defineProps<{
  label: string
  index: number
  first: boolean
  last: boolean
  editingPosition: boolean
}>()

type Action = 'move-up' | 'move-down' | 'edit-position' | 'show-on-map' | 'remove'

const emit = defineEmits<(event: Action) => void>()

interface Item {
  action: Action
  text: string
  testId: string
  disabled?: boolean
  destructive?: boolean
}

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const menuId = useId()

// Each item names the stop in its visible text as well as to assistive tech,
// so a spoken command can say exactly what is on screen.
const items = computed<Item[]>(() => [
  { action: 'move-up', text: `Move ${props.label} up`, testId: `stop-up-${props.index}`, disabled: props.first },
  { action: 'move-down', text: `Move ${props.label} down`, testId: `stop-down-${props.index}`, disabled: props.last },
  {
    action: 'edit-position',
    text: `${props.editingPosition ? 'Hide' : 'Edit'} position of ${props.label}`,
    testId: `stop-edit-position-${props.index}`,
  },
  { action: 'show-on-map', text: `Show ${props.label} on map`, testId: `stop-show-${props.index}` },
  { action: 'remove', text: `Remove ${props.label}`, testId: `stop-remove-${props.index}`, destructive: true },
])

function enabledItems(): HTMLButtonElement[] {
  return Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
}

async function openMenu(focus: 'first' | 'last'): Promise<void> {
  open.value = true
  await nextTick()
  const enabled = enabledItems()
  ;(focus === 'first' ? enabled[0] : enabled[enabled.length - 1])?.focus()
}

function close(returnFocus: boolean): void {
  if (!open.value) return
  open.value = false
  if (returnFocus) trigger.value?.focus()
}

function toggle(): void {
  if (open.value) close(true)
  else void openMenu('first')
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    void openMenu(event.key === 'ArrowDown' ? 'first' : 'last')
  }
}

function onMenuKeydown(event: KeyboardEvent): void {
  const enabled = enabledItems()
  const at = enabled.indexOf(document.activeElement as HTMLButtonElement)
  let next: number
  switch (event.key) {
    case 'ArrowDown': next = (at + 1) % enabled.length; break
    case 'ArrowUp': next = (at - 1 + enabled.length) % enabled.length; break
    case 'Home': next = 0; break
    case 'End': next = enabled.length - 1; break
    case 'Escape':
      // Kept from the page, whose own Escape disarms click-to-place: closing a
      // menu should not also stop the author placing stops.
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    case 'Tab':
      close(false)
      return
    default:
      return
  }
  event.preventDefault()
  enabled[next]?.focus()
}

// Focus goes back to the trigger before the action runs, so whatever the
// action opens — the remove confirmation above all — returns there too. A
// move carries the row, and the trigger with it, to a new place in the list;
// moving a focused node can drop its focus, so it is put back afterwards.
async function choose(item: Item): Promise<void> {
  if (item.disabled) return
  close(true)
  emit(item.action)
  if (item.action === 'move-up' || item.action === 'move-down') {
    await nextTick()
    trigger.value?.focus()
  }
}

function onPointerDownOutside(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node | null)) close(false)
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onPointerDownOutside, true)
  else document.removeEventListener('pointerdown', onPointerDownOutside, true)
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDownOutside, true))
</script>

<template>
  <div
    ref="root"
    class="relative"
  >
    <button
      ref="trigger"
      type="button"
      class="flex size-7 cursor-pointer items-center justify-center rounded-(--radius-field) text-ink-muted hover:bg-surface hover:text-ink aria-expanded:bg-surface aria-expanded:text-ink"
      :aria-label="`Actions for ${label}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      :data-testid="`stop-actions-${index}`"
      @click.stop="toggle"
      @keydown="onTriggerKeydown"
    >
      <span aria-hidden="true">⋯</span>
    </button>
    <ul
      v-if="open"
      :id="menuId"
      ref="menu"
      role="menu"
      :aria-label="`Actions for ${label}`"
      class="absolute top-full right-0 z-10 mt-1 flex w-max max-w-72 flex-col rounded-(--radius-box) border border-border bg-white p-1 shadow-(--shadow-panel)"
      :data-testid="`stop-menu-${index}`"
      @keydown="onMenuKeydown"
    >
      <li
        v-for="item in items"
        :key="item.action"
        role="none"
      >
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          class="font-body text-caption w-full cursor-pointer truncate rounded-(--radius-field) px-3 py-1.5 text-left hover:bg-surface focus:bg-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          :class="item.destructive ? 'text-error' : 'text-ink'"
          :disabled="item.disabled"
          :data-testid="item.testId"
          @click.stop="choose(item)"
        >
          {{ item.text }}
        </button>
      </li>
    </ul>
  </div>
</template>
