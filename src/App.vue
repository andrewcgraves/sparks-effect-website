<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Analytics, type BeforeSend } from '@vercel/analytics/vue'
import { redactUrl } from './analytics/redact'
import ConfirmDialog from './components/ConfirmDialog.vue'
import SiteFooter from './components/SiteFooter.vue'
import SiteHeader from './components/SiteHeader.vue'
import ToastRegion from './components/ToastRegion.vue'

const redactAnalyticsEvent: BeforeSend = (event) => ({ ...event, url: redactUrl(event.url) })

const content = ref<HTMLElement | null>(null)

// PROTOTYPE (SPA-462): an embed route carries no site chrome.
const route = useRoute()
const chrome = computed(() => route.meta.chrome !== false)

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
      v-if="chrome"
      href="#content"
      class="font-display text-btn sr-only z-50 rounded-(--radius-field) bg-white px-4 py-2 text-ink uppercase shadow-(--shadow-panel) focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      data-testid="skip-link"
      @click.prevent="skipToContent"
    >
      Skip to content
    </a>
    <SiteHeader v-if="chrome" />
    <div
      id="content"
      ref="content"
      class="flex flex-1 scroll-mt-16 flex-col outline-none"
      tabindex="-1"
    >
      <RouterView />
    </div>
    <SiteFooter v-if="chrome" />
    <ConfirmDialog />
    <ToastRegion />
    <Analytics :before-send="redactAnalyticsEvent" />
  </div>
</template>
