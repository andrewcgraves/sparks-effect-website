<script setup lang="ts">
// PROTOTYPE A, "Two rails": the ticket as written. The form scrolls in four
// headed cards; the map rides alongside; the save bar rides the bottom of the
// form column.
import { TONE_DOT_CLASS, type EditorSection, type SaveStatus } from './types'

defineProps<{ sections: EditorSection[], status: SaveStatus }>()
</script>

<template>
  <div class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr]">
    <div class="flex flex-col gap-6">
      <section
        v-for="section in sections"
        :key="section.key"
        class="rounded-(--radius-box) border border-border bg-surface p-4"
        :data-testid="`section-${section.key}`"
      >
        <h2 class="font-display text-h3 text-ink-true">
          {{ section.title }}
          <span
            v-if="section.state === 'optional'"
            class="font-body text-caption font-normal text-ink-muted"
          >optional</span>
        </h2>
        <div class="mt-3">
          <slot :name="section.key" />
        </div>
      </section>

      <div
        class="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-t-(--radius-box) border border-b-0 border-border bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/6%)] backdrop-blur"
        data-testid="save-bar"
      >
        <p class="font-body text-caption flex items-center gap-2 text-ink">
          <span
            class="size-2 rounded-full"
            :class="TONE_DOT_CLASS[status.tone]"
          />
          <span data-testid="save-status">{{ status.label }}</span>
          <span
            v-if="status.note"
            class="text-ink-muted"
          >· {{ status.note }}</span>
        </p>
        <div class="flex items-center gap-4">
          <slot name="actions" />
        </div>
      </div>
    </div>

    <div class="max-lg:h-[60vh]">
      <div class="h-full lg:sticky lg:top-4 lg:h-[calc(100svh-2rem)]">
        <slot name="map" />
      </div>
    </div>
  </div>
</template>
