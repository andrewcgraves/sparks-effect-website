<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. The lines as a plain text list for the
// blog-style variants: a name that is a link and one line of subtext, with a
// hairline between entries. No thumbnails, no panels.
import { computed } from 'vue'
import { visibleLines, type HomeData } from '../homePrototypeData'
import LinesStatus from '../LinesStatus.vue'

const props = defineProps<{ data: HomeData }>()
const shown = computed(() => visibleLines(props.data))
</script>

<template>
  <div>
    <div
      v-if="shown.failed || shown.unavailable.length || shown.lines.length === 0"
      class="mb-3"
    >
      <LinesStatus
        :failed="shown.failed"
        :unavailable="shown.unavailable"
        :empty="shown.lines.length === 0"
      />
    </div>
    <ul
      v-if="shown.lines.length"
      class="divide-y divide-border border-y border-border"
    >
      <li
        v-for="line in shown.lines"
        :key="`${line.kind}:${line.slug}`"
        class="flex flex-col gap-0.5 py-4"
      >
        <router-link
          :to="line.to"
          class="font-display text-h3 text-ink-true transition-colors duration-200 ease-(--ease-smooth) hover:text-coral hover:underline"
        >
          {{ line.name }}
        </router-link>
        <span class="font-body text-caption line-clamp-2 text-ink-muted">{{ line.caption }}</span>
      </li>
    </ul>
  </div>
</template>
