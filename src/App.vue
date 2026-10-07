<script setup lang="ts">
import { ref } from 'vue'
import { Analytics, type BeforeSend } from '@vercel/analytics/vue'
import { redactUrl } from './analytics/redact'
import ConfirmDialog from './components/ConfirmDialog.vue'
import SiteFooter from './components/SiteFooter.vue'
import ToastRegion from './components/ToastRegion.vue'
import { ACTION_LINK_CLASS } from './components/linkStyles'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()

const redactAnalyticsEvent: BeforeSend = (event) => ({ ...event, url: redactUrl(event.url) })

const content = ref<HTMLElement | null>(null)

// Focused by hand rather than left to the browser: a #content in the URL is a
// navigation vue-router would act on, and it would outlive the skip.
function skipToContent(): void {
  content.value?.focus()
  content.value?.scrollIntoView()
}
</script>

<template>
  <div class="flex min-h-svh flex-col">
    <a
      href="#content"
      class="font-display text-btn sr-only z-50 rounded-(--radius-field) bg-white px-4 py-2 text-ink uppercase shadow-(--shadow-panel) focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      data-testid="skip-link"
      @click.prevent="skipToContent"
    >
      Skip to content
    </a>
    <header class="flex justify-end gap-4 p-(--page-padding) pb-0">
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
        class="font-display text-btn text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
        data-testid="nav-authoring"
      >
        My authoring
      </RouterLink>
      <RouterLink
        v-else
        to="/login"
        class="font-display text-btn text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
        data-testid="nav-login"
      >
        Sign in
      </RouterLink>
    </header>
    <div
      id="content"
      ref="content"
      class="flex flex-1 flex-col outline-none"
      tabindex="-1"
    >
      <RouterView />
    </div>
    <SiteFooter />
    <ConfirmDialog />
    <ToastRegion />
    <Analytics :before-send="redactAnalyticsEvent" />
  </div>
</template>
