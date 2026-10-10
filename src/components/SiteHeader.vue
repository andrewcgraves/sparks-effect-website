<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAccountNav } from '../composables/useAccountNav'
import { useOutsidePointerDown } from '../composables/useOutsidePointerDown'
import { useRoutedPages } from '../composables/useRoutedPages'
import { useAuthStore } from '../stores/auth'
import AccountMenu from './AccountMenu.vue'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { ACTION_LINK_CLASS } from './linkStyles'

const NAV_PAGES = [
  { label: 'Networks', path: '/networks' },
  { label: 'Lines', path: '/lines' },
  { label: 'How it works', path: '/how-it-works' },
]

const PRIMARY_LINK_CLASS =
  `${ACTION_LINK_CLASS} flex h-full items-center border-b-2 border-transparent aria-[current=page]:border-coral aria-[current=page]:text-ink`

const SHEET_LINK_CLASS =
  'font-display text-btn block w-full cursor-pointer py-3 text-left text-ink uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral aria-[current=page]:text-coral'

const auth = useAuthStore()
const route = useRoute()
const navLinks = useRoutedPages(NAV_PAGES)
const { label: accountLabel, links: accountLinks, signOut } = useAccountNav()

const header = ref<HTMLElement | null>(null)
const sheetButton = ref<HTMLButtonElement | null>(null)
const sheetOpen = ref(false)
const sheetId = useId()

// RouterLink only marks an exact match; a primary page stays current on every
// page beneath it, such as one line under Lines.
function isCurrent(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`)
}

function closeSheet(returnFocus: boolean): void {
  if (!sheetOpen.value) return
  sheetOpen.value = false
  if (returnFocus) sheetButton.value?.focus()
}

function onHeaderKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !sheetOpen.value) return
  event.preventDefault()
  closeSheet(true)
}

// Signing out on the home page leaves the route where it was, so the sheet is
// closed here rather than left to the route watcher.
async function signOutFromSheet(): Promise<void> {
  closeSheet(false)
  await signOut()
}

function onHeaderFocusout(event: FocusEvent): void {
  if (!header.value?.contains(event.relatedTarget as Node | null)) closeSheet(false)
}

useOutsidePointerDown(header, sheetOpen, () => closeSheet(false))

watch(() => route.fullPath, () => closeSheet(false))

// The sheet is only drawn below sm; one left open there would come back on
// its own the next time the window narrows.
const wide = window.matchMedia?.('(min-width: 40rem)')
function onWideChange(event: MediaQueryListEvent): void {
  if (event.matches) closeSheet(false)
}
onMounted(() => wide?.addEventListener('change', onWideChange))
onBeforeUnmount(() => wide?.removeEventListener('change', onWideChange))
</script>

<template>
  <header
    ref="header"
    class="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-white px-(--page-gutter) whitespace-nowrap"
    @keydown="onHeaderKeydown"
    @focusout="onHeaderFocusout"
  >
    <div class="flex h-full items-center gap-8">
      <RouterLink
        to="/"
        class="font-display text-[17px] font-bold tracking-tight text-ink-true"
        data-testid="nav-home"
      >
        Sparks Effect
      </RouterLink>
      <nav
        v-if="navLinks.length > 0"
        aria-label="Primary"
        class="hidden h-full gap-7 sm:flex"
      >
        <RouterLink
          v-for="link in navLinks"
          :key="link.path"
          :to="link.path"
          :class="PRIMARY_LINK_CLASS"
          :aria-current="isCurrent(link.path) ? 'page' : undefined"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>
    <div class="hidden min-w-0 items-center gap-4 sm:flex">
      <AccountMenu v-if="auth.isAuthenticated" />
      <RouterLink
        v-else
        to="/login"
        :class="`${SECONDARY_BUTTON_CLASS} inline-flex h-9 items-center`"
        data-testid="nav-login"
      >
        Sign in
      </RouterLink>
    </div>
    <button
      ref="sheetButton"
      type="button"
      :class="`${ACTION_LINK_CLASS} aria-expanded:text-ink sm:hidden`"
      :aria-expanded="sheetOpen"
      :aria-controls="sheetOpen ? sheetId : undefined"
      data-testid="site-menu-button"
      @click="sheetOpen = !sheetOpen"
    >
      Menu
    </button>
    <div
      v-if="sheetOpen"
      :id="sheetId"
      class="absolute inset-x-0 top-full flex max-h-[calc(100svh-4rem)] flex-col overflow-y-auto overscroll-contain divide-y divide-border border-b border-border bg-white px-(--page-gutter) whitespace-normal shadow-(--shadow-panel) sm:hidden"
      data-testid="site-menu-sheet"
    >
      <nav
        v-if="navLinks.length > 0"
        aria-label="Site"
        class="py-2"
      >
        <ul>
          <li
            v-for="link in navLinks"
            :key="link.path"
          >
            <RouterLink
              :to="link.path"
              :class="SHEET_LINK_CLASS"
              :aria-current="isCurrent(link.path) ? 'page' : undefined"
            >
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>
      <div
        v-if="auth.isAuthenticated"
        class="py-2"
      >
        <p class="font-body text-caption truncate pt-2 text-ink-muted">
          {{ accountLabel }}
        </p>
        <nav aria-label="Account">
          <ul>
            <li
              v-for="link in accountLinks"
              :key="link.path"
            >
              <RouterLink
                :to="link.path"
                :class="SHEET_LINK_CLASS"
              >
                {{ link.label }}
              </RouterLink>
            </li>
          </ul>
        </nav>
        <button
          type="button"
          :class="SHEET_LINK_CLASS"
          data-testid="site-menu-sign-out"
          @click="signOutFromSheet"
        >
          Sign out
        </button>
      </div>
      <div
        v-else
        class="py-2"
      >
        <RouterLink
          to="/login"
          :class="SHEET_LINK_CLASS"
        >
          Sign in
        </RouterLink>
      </div>
    </div>
  </header>
</template>
