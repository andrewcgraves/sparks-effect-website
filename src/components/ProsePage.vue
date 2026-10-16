<script setup lang="ts">
import { computed } from 'vue'
import AllLinesLink from './AllLinesLink.vue'

const props = defineProps<{
  title: string
  // The day the text last changed, as YYYY-MM-DD. Bump it with every edit to
  // the page's copy: a dated policy is what tells a reader whether it moved.
  updated: string
}>()

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

const updatedInWords = computed(() => {
  if (!CALENDAR_DAY.test(props.updated)) {
    throw new Error(`ProsePage: updated must be a calendar day as YYYY-MM-DD, got "${props.updated}"`)
  }
  // Pinned to UTC so the day never shifts under a reader west of Greenwich.
  return new Date(`${props.updated}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
})
</script>

<template>
  <!-- The same padding as --page-padding, split so a page can put something
       wider than the text column between its prose. -->
  <main class="flex-1 pt-8 pb-24">
    <div class="px-(--page-gutter)">
      <div class="mb-8">
        <AllLinesLink />
      </div>

      <article class="max-w-[720px]">
        <h1 class="font-display text-display text-ink-true">
          {{ title }}
        </h1>
        <p
          class="t-meta mt-3 text-ink-muted"
          data-testid="page-updated"
        >
          Last updated <time :datetime="updated">{{ updatedInWords }}</time>
        </p>
        <slot />
      </article>
    </div>
    <slot name="wide" />
    <div
      v-if="$slots.after"
      class="px-(--page-gutter)"
    >
      <div
        class="max-w-[720px]"
        data-testid="prose-after"
      >
        <slot name="after" />
      </div>
    </div>
  </main>
</template>
