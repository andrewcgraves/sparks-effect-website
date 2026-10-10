<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAccountNav } from '../composables/useAccountNav'
import { useOutsidePointerDown } from '../composables/useOutsidePointerDown'
import { ACTION_LINK_CLASS } from './linkStyles'

const MENU_ITEM_CLASS =
  'font-body text-caption block w-full cursor-pointer rounded-(--radius-field) px-3 py-1.5 text-left text-ink hover:bg-surface focus:bg-surface focus-visible:-outline-offset-(--focus-ring-width)'

const route = useRoute()
const { label, links, signOut } = useAccountNav()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const menuId = useId()

function menuItems(): HTMLElement[] {
  return Array.from(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
}

async function openMenu(focus: 'first' | 'last'): Promise<void> {
  open.value = true
  await nextTick()
  const items = menuItems()
  ;(focus === 'first' ? items[0] : items[items.length - 1])?.focus()
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
  const items = menuItems()
  const at = items.indexOf(document.activeElement as HTMLElement)
  let next: number
  switch (event.key) {
    case 'ArrowDown': next = (at + 1) % items.length; break
    case 'ArrowUp': next = (at - 1 + items.length) % items.length; break
    case 'Home': next = 0; break
    case 'End': next = items.length - 1; break
    case 'Escape':
      event.preventDefault()
      close(true)
      return
    case 'Tab':
      close(false)
      return
    default:
      return
  }
  event.preventDefault()
  items[next]?.focus()
}

async function signOutFromMenu(): Promise<void> {
  close(false)
  await signOut()
}

useOutsidePointerDown(root, open, () => close(false))

watch(() => route.fullPath, () => close(false))
</script>

<template>
  <div
    ref="root"
    class="relative"
  >
    <button
      ref="trigger"
      type="button"
      :class="`${ACTION_LINK_CLASS} flex max-w-56 items-center gap-1.5 aria-expanded:text-ink`"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      data-testid="account-menu-button"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="truncate">{{ label }}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 10 6"
        class="size-2.5 shrink-0 fill-none stroke-current stroke-[1.5]"
      >
        <path d="M1 1l4 4 4-4" />
      </svg>
    </button>
    <ul
      v-if="open"
      :id="menuId"
      ref="menu"
      role="menu"
      :aria-label="label"
      class="absolute top-full right-0 z-30 mt-2 flex w-max min-w-44 flex-col rounded-(--radius-box) border border-border bg-white p-1 shadow-(--shadow-panel)"
      data-testid="account-menu"
      @keydown="onMenuKeydown"
    >
      <li
        v-for="link in links"
        :key="link.path"
        role="none"
      >
        <RouterLink
          :to="link.path"
          role="menuitem"
          tabindex="-1"
          :class="MENU_ITEM_CLASS"
          :data-testid="link.testId"
          @click="close(false)"
        >
          {{ link.label }}
        </RouterLink>
      </li>
      <li
        role="separator"
        class="my-1 border-t border-border"
      />
      <li role="none">
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          :class="MENU_ITEM_CLASS"
          data-testid="nav-sign-out"
          @click="signOutFromMenu"
        >
          Sign out
        </button>
      </li>
    </ul>
  </div>
</template>
