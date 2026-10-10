<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. The featured-lines section the quiet
// variants share: one heading, one "see all" link, the shared status copy,
// and the shared card in a grid or as a list of rows.
import { computed } from 'vue'
import { visibleLines, type HomeData } from '../homePrototypeData'
import { INLINE_LINK_CLASS } from '../../../components/linkStyles'
import LinesStatus from '../LinesStatus.vue'
import LineCard from './LineCard.vue'

const props = withDefaults(defineProps<{ data: HomeData; layout?: 'grid' | 'list'; heading?: string }>(), {
  layout: 'grid',
  heading: 'Featured lines',
})
const shown = computed(() => visibleLines(props.data))
</script>

<template>
  <section>
    <div class="flex items-baseline justify-between gap-4">
      <h2 class="font-display text-h2 text-ink-true">
        {{ heading }}
      </h2>
      <router-link
        to="/services"
        :class="['font-body text-caption text-ink-muted', INLINE_LINK_CLASS]"
      >
        See all lines
      </router-link>
    </div>
    <div
      v-if="shown.failed || shown.unavailable.length || shown.lines.length === 0"
      class="mt-3"
    >
      <LinesStatus
        :failed="shown.failed"
        :unavailable="shown.unavailable"
        :empty="shown.lines.length === 0"
      />
    </div>
    <ul
      v-if="shown.lines.length"
      class="mt-5 grid gap-4"
      :class="layout === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3' : ''"
    >
      <li
        v-for="line in shown.lines"
        :key="`${line.kind}:${line.slug}`"
      >
        <LineCard
          :line="line"
          :layout="layout === 'grid' ? 'stacked' : 'row'"
        />
      </li>
    </ul>
  </section>
</template>
