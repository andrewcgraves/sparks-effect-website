<script setup lang="ts">
// PROTOTYPE C, "Outline + command bar": save state and Save live in a bar
// pinned to the top of the viewport, a left outline says which sections still
// need something, and the form reads as one long document beside the map.
import { computed } from 'vue'
import { TONE_DOT_CLASS, type EditorSection, type SaveStatus, type SectionState } from './types'

const props = defineProps<{ sections: EditorSection[], status: SaveStatus }>()

const required = computed(() => props.sections.filter((s) => s.state !== 'optional'))
const readyCount = computed(() => required.value.filter((s) => s.state === 'ready').length)

const STATE_MARK: Record<SectionState, string> = {
  ready: '✓',
  todo: '○',
  optional: '–',
}

function jumpTo(key: string): void {
  document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div
    class="sticky top-0 z-20 -mx-(--page-gutter) mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-border bg-white/95 px-(--page-gutter) py-3 backdrop-blur"
    data-testid="save-bar"
  >
    <div class="font-body text-caption flex flex-wrap items-center gap-x-4 gap-y-1 text-ink">
      <span class="flex items-center gap-2">
        <span
          class="size-2 rounded-full"
          :class="TONE_DOT_CLASS[status.tone]"
        />
        <span data-testid="save-status">{{ status.label }}</span>
      </span>
      <span class="text-ink-muted">{{ readyCount }} of {{ required.length }} required sections done</span>
      <span
        v-if="status.note"
        class="text-ink-muted max-sm:hidden"
      >{{ status.note }}</span>
    </div>
    <div class="flex items-center gap-4">
      <slot name="actions" />
    </div>
  </div>

  <div class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr] xl:grid-cols-[176px_minmax(0,1fr)_minmax(0,1fr)]">
    <nav
      aria-label="Sections"
      class="hidden xl:block"
    >
      <ol class="sticky top-24 flex flex-col gap-1 border-l border-border">
        <li
          v-for="section in sections"
          :key="section.key"
        >
          <button
            type="button"
            class="font-body text-caption -ml-px flex w-full cursor-pointer items-baseline gap-2 border-l-2 border-transparent py-1.5 pl-3 text-left text-ink-muted hover:border-coral hover:text-ink"
            :data-testid="`outline-${section.key}`"
            @click="jumpTo(section.key)"
          >
            <span
              class="w-3 shrink-0"
              :class="section.state === 'ready' ? 'text-coral' : 'text-ink-faint'"
              aria-hidden="true"
            >{{ STATE_MARK[section.state] }}</span>
            <span>
              <span class="block text-ink">{{ section.title }}</span>
              <span class="block">{{ section.hint }}</span>
            </span>
          </button>
        </li>
      </ol>
    </nav>

    <div class="flex flex-col">
      <section
        v-for="(section, i) in sections"
        :id="`section-${section.key}`"
        :key="section.key"
        class="scroll-mt-24 border-border py-6 first:pt-0"
        :class="i > 0 ? 'border-t' : ''"
        :data-testid="`section-${section.key}`"
      >
        <h2 class="font-display text-h2 text-ink-true">
          {{ section.title }}
        </h2>
        <div class="mt-4">
          <slot :name="section.key" />
        </div>
      </section>
    </div>

    <div class="max-lg:h-[60vh]">
      <div class="h-full lg:sticky lg:top-24 lg:h-[calc(100svh-7rem)]">
        <slot name="map" />
      </div>
    </div>
  </div>
</template>
