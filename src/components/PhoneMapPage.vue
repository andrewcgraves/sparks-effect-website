<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'
import { ACTION_LINK_CLASS } from './linkStyles'
import { tabForKey, type PhoneMapTab } from './phoneMapTabs'

const props = defineProps<{
  title: string
  tabs: PhoneMapTab[]
  pickArmed?: boolean
}>()

const tab = defineModel<string>('tab', { required: true })

const id = useId()
const panelId = `${id}-panel`

function tabId(key: string): string {
  return `${id}-tab-${key}`
}

function tabpanelId(key: string): string {
  return `${id}-tabpanel-${key}`
}

// 'tall' gives the panel room to read; 'short' gives the map room to aim.
const panelSize = ref<'short' | 'tall'>('tall')

watch(
  () => props.pickArmed,
  (armed) => {
    panelSize.value = armed ? 'short' : 'tall'
  },
)

function choose(key: string): void {
  tab.value = key
  panelSize.value = 'tall'
}

// Selection follows focus, as the tabs pattern has it: the chosen tab is the
// list's one tab stop, so focus has to move with the choice.
function onListKeydown(event: KeyboardEvent): void {
  const next = tabForKey(props.tabs, tab.value, event.key)
  if (!next) return
  event.preventDefault()
  choose(next)
  document.getElementById(tabId(next))?.focus()
}
</script>

<template>
  <div
    class="fixed inset-x-0 top-16 bottom-0 z-10 flex flex-col bg-white"
    data-testid="phone-map-page"
  >
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <h1
        v-if="props.title"
        class="font-display min-w-0 flex-1 truncate text-[17px] font-bold text-ink-true"
      >
        {{ props.title }}
      </h1>
      <LoadingRegion
        v-else
        class="font-display min-w-0 flex-1 text-[17px]"
      >
        <SkeletonShape class="w-40" />
      </LoadingRegion>
      <button
        type="button"
        :class="`${ACTION_LINK_CLASS} shrink-0`"
        :aria-expanded="panelSize === 'tall'"
        :aria-controls="panelId"
        data-testid="phone-panel-toggle"
        @click="panelSize = panelSize === 'tall' ? 'short' : 'tall'"
      >
        {{ panelSize === 'tall' ? 'More map' : 'More panel' }}
      </button>
    </header>

    <div class="relative min-h-0 flex-1">
      <slot name="map" />
    </div>

    <!-- Sized against the page area under the site header, not the viewport,
         so the split reads the same whatever the header's height. -->
    <section
      :id="panelId"
      class="flex shrink-0 flex-col border-t border-border bg-white transition-[height] duration-300 ease-(--ease-smooth)"
      :style="{ height: panelSize === 'tall' ? '52%' : '24%' }"
      data-testid="phone-panel"
    >
      <div
        role="tablist"
        aria-label="Map page panel"
        class="flex shrink-0 border-b border-border"
        @keydown="onListKeydown"
      >
        <button
          v-for="entry in props.tabs"
          :id="tabId(entry.key)"
          :key="entry.key"
          type="button"
          role="tab"
          :aria-selected="tab === entry.key"
          :aria-controls="tabpanelId(entry.key)"
          :tabindex="tab === entry.key ? 0 : -1"
          :disabled="entry.disabled"
          class="font-display text-btn relative flex-1 cursor-pointer py-3 uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral disabled:cursor-not-allowed disabled:opacity-35"
          :class="tab === entry.key ? 'text-coral' : 'text-ink-muted'"
          @click="choose(entry.key)"
        >
          {{ entry.label }}
          <span
            v-if="tab === entry.key"
            class="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-coral"
            aria-hidden="true"
          />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <!-- v-show, not v-if: the plot form keeps what was typed when the
             visitor flips to the results and back. -->
        <div
          v-for="entry in props.tabs"
          v-show="tab === entry.key"
          :id="tabpanelId(entry.key)"
          :key="entry.key"
          role="tabpanel"
          :aria-labelledby="tabId(entry.key)"
          tabindex="0"
          class="flex flex-col gap-4"
        >
          <slot :name="`panel-${entry.key}`" />
        </div>
      </div>
    </section>
  </div>
</template>
