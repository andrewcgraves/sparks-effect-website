<script setup lang="ts">
import { Analytics, type BeforeSend } from '@vercel/analytics/vue'
import { redactUrl } from './analytics/redact'
import ConfirmDialog from './components/ConfirmDialog.vue'
import SiteFooter from './components/SiteFooter.vue'
import SiteHeader from './components/SiteHeader.vue'
import ToastRegion from './components/ToastRegion.vue'

const redactAnalyticsEvent: BeforeSend = (event) => ({ ...event, url: redactUrl(event.url) })
</script>

<template>
  <div class="flex min-h-svh flex-col">
    <SiteHeader />
    <RouterView />
    <SiteFooter />
    <ConfirmDialog />
    <ToastRegion />
    <Analytics :before-send="redactAnalyticsEvent" />
  </div>
</template>
