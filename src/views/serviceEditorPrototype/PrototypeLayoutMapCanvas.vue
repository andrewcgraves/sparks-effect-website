<script setup lang="ts">
// PROTOTYPE B, "Map canvas": the map is the workspace and the form is a
// fixed-height side panel, one section at a time behind tabs. Nothing on the
// page scrolls on desktop; only the panel's body does.
import { computed, ref } from 'vue'
import { TONE_DOT_CLASS, type EditorSection, type SaveStatus, type SectionKey, type SectionState } from './types'

const props = defineProps<{ sections: EditorSection[], status: SaveStatus }>()

const active = ref<SectionKey>('identity')

const activeIndex = computed(() => props.sections.findIndex((s) => s.key === active.value))
const nextSection = computed(() => props.sections[activeIndex.value + 1] ?? null)

const STATE_MARK: Record<SectionState, string> = {
  ready: 'bg-coral',
  todo: 'border border-ink-faint bg-white',
  optional: 'bg-border',
}
</script>

<template>
  <div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
    <div class="max-lg:h-[55vh] lg:sticky lg:top-4 lg:h-[calc(100svh-2rem)]">
      <slot name="map" />
    </div>

    <div
      class="flex flex-col rounded-(--radius-box) border border-border bg-surface lg:sticky lg:overflow-hidden lg:top-4 lg:h-[calc(100svh-2rem)]"
    >
      <div
        role="tablist"
        aria-label="Service sections"
        class="grid shrink-0 grid-cols-4 border-b border-border bg-white"
      >
        <button
          v-for="section in sections"
          :key="section.key"
          type="button"
          role="tab"
          :aria-selected="section.key === active"
          class="font-body text-caption flex cursor-pointer flex-col items-start gap-1 border-b-2 px-3 py-2.5 text-left transition-colors duration-200 ease-(--ease-smooth)"
          :class="section.key === active ? 'border-coral text-ink' : 'border-transparent text-ink-muted hover:text-ink'"
          :data-testid="`tab-${section.key}`"
          @click="active = section.key"
        >
          <span
            class="size-2 rounded-full"
            :class="STATE_MARK[section.state]"
          />
          <span class="leading-tight">{{ section.title }}</span>
        </button>
      </div>

      <div class="min-h-0 flex-1 p-4 lg:overflow-y-auto">
        <section
          v-for="section in sections"
          v-show="section.key === active"
          :key="section.key"
          role="tabpanel"
          :data-testid="`section-${section.key}`"
        >
          <h2 class="font-display text-h3 text-ink-true">
            {{ section.title }}
          </h2>
          <p class="font-body text-caption mt-1 text-ink-muted">
            {{ section.hint }}
          </p>
          <div class="mt-4">
            <slot :name="section.key" />
          </div>
        </section>

        <button
          v-if="nextSection"
          type="button"
          class="font-display text-btn mt-6 cursor-pointer text-ink-muted uppercase hover:text-coral"
          data-testid="next-section"
          @click="active = nextSection.key"
        >
          Next: {{ nextSection.title }}
        </button>
      </div>

      <div
        class="flex shrink-0 flex-col gap-2 border-t border-border bg-white px-4 py-3 max-lg:sticky max-lg:bottom-0"
        data-testid="save-bar"
      >
        <p class="font-body text-caption flex items-center gap-2 text-ink">
          <span
            class="size-2 rounded-full"
            :class="TONE_DOT_CLASS[status.tone]"
          />
          <span data-testid="save-status">{{ status.label }}</span>
        </p>
        <p
          v-if="status.note"
          class="font-body text-caption -mt-1 text-ink-muted"
        >
          {{ status.note }}
        </p>
        <div class="flex items-center justify-between gap-4">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </div>
</template>
