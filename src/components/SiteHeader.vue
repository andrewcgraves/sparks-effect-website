<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { ACTION_LINK_CLASS } from './linkStyles'

const NAV_PAGES = [
  { label: 'Networks', path: '/networks' },
  { label: 'Lines', path: '/lines' },
  { label: 'How it works', path: '/how-it-works' },
]

const PRIMARY_LINK_CLASS =
  `${ACTION_LINK_CLASS} flex h-full items-center border-b-2 border-transparent [&.router-link-active]:border-coral [&.router-link-active]:text-ink`

const auth = useAuthStore()
const router = useRouter()

// As in the footer, each page is linked only once its route lands.
const navLinks = computed(() => {
  const paths = new Set(router.getRoutes().map((route) => route.path))
  return NAV_PAGES.filter((page) => paths.has(page.path))
})
</script>

<template>
  <header class="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-border bg-white px-(--page-gutter) whitespace-nowrap">
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
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>
    <div class="flex items-center gap-4">
      <RouterLink
        v-if="auth.isAuthenticated && auth.user?.is_admin"
        to="/admin"
        :class="ACTION_LINK_CLASS"
        data-testid="nav-admin"
      >
        Admin
      </RouterLink>
      <RouterLink
        v-if="auth.isAuthenticated"
        to="/authoring"
        :class="ACTION_LINK_CLASS"
        data-testid="nav-authoring"
      >
        My authoring
      </RouterLink>
      <RouterLink
        v-else
        to="/login"
        :class="`${SECONDARY_BUTTON_CLASS} inline-flex h-9 items-center`"
        data-testid="nav-login"
      >
        Sign in
      </RouterLink>
    </div>
  </header>
</template>
