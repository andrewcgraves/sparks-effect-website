<script setup lang="ts">
import { Analytics, type BeforeSend } from '@vercel/analytics/vue'
import { redactUrl } from './analytics/redact'
import ConfirmDialog from './components/ConfirmDialog.vue'
import SiteFooter from './components/SiteFooter.vue'
import ToastRegion from './components/ToastRegion.vue'
import { ACTION_LINK_CLASS } from './components/linkStyles'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()

const redactAnalyticsEvent: BeforeSend = (event) => ({ ...event, url: redactUrl(event.url) })
</script>

<template>
  <div class="flex min-h-svh flex-col">
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
    <RouterView />
    <SiteFooter />
    <ConfirmDialog />
    <ToastRegion />
    <Analytics :before-send="redactAnalyticsEvent" />
  </div>
</template>
