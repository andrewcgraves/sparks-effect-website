<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminPeople from '../components/AdminPeople.vue'
import AdminPublished from '../components/AdminPublished.vue'

const TABS = [
  { id: 'people', label: 'People' },
  { id: 'published', label: 'Published' },
] as const

type TabId = (typeof TABS)[number]['id']

const route = useRoute()
const router = useRouter()

const active = computed<TabId>(() => (route.query.tab === 'published' ? 'published' : 'people'))

const tabButtons = ref<HTMLButtonElement[]>([])

function select(id: TabId): Promise<unknown> {
  return router.replace({ query: { ...route.query, tab: id === 'people' ? undefined : id } })
}

async function onKeydown(event: KeyboardEvent, index: number): Promise<void> {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (step === 0) return
  event.preventDefault()
  const next = (index + step + TABS.length) % TABS.length
  await select(TABS[next].id)
  await nextTick()
  tabButtons.value[next]?.focus()
}
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <h1 class="font-display text-display mt-8 text-ink-true">
      Admin
    </h1>

    <div
      role="tablist"
      aria-label="Admin sections"
      class="mt-6 flex gap-2 border-b border-border"
    >
      <button
        v-for="(tab, index) in TABS"
        :id="`admin-tab-${tab.id}`"
        :key="tab.id"
        ref="tabButtons"
        type="button"
        role="tab"
        :aria-selected="active === tab.id"
        :aria-controls="`admin-panel-${tab.id}`"
        :tabindex="active === tab.id ? 0 : -1"
        class="font-display text-btn -mb-px cursor-pointer border-b-2 px-3 py-2 uppercase transition-colors duration-200 ease-(--ease-smooth)"
        :class="active === tab.id ? 'border-coral text-ink-true' : 'border-transparent text-ink-muted hover:text-coral'"
        :data-testid="`tab-${tab.id}`"
        @click="select(tab.id)"
        @keydown="onKeydown($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      :id="`admin-panel-${active}`"
      role="tabpanel"
      :aria-labelledby="`admin-tab-${active}`"
      class="mt-6"
    >
      <AdminPublished v-if="active === 'published'" />
      <AdminPeople v-else />
    </div>
  </main>
</template>
