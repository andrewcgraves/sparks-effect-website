<script setup lang="ts">
import { computed } from 'vue'
import type { Crumb } from './crumbs'
import { ACTION_LINK_CLASS } from './linkStyles'

const props = defineProps<{ items: Crumb[] }>()

const ancestors = computed(() => props.items.slice(0, -1))
const current = computed(() => props.items.at(-1))
</script>

<template>
  <nav aria-label="Breadcrumb">
    <ol class="font-display text-btn flex flex-wrap items-center gap-x-2 gap-y-1 uppercase">
      <li
        v-for="(crumb, index) in ancestors"
        :key="index"
        class="flex items-center gap-x-2"
      >
        <RouterLink
          v-if="crumb.to"
          :to="crumb.to"
          :class="ACTION_LINK_CLASS"
        >
          {{ crumb.label }}
        </RouterLink>
        <span
          v-else
          class="text-ink-muted"
        >{{ crumb.label }}</span>
        <span
          aria-hidden="true"
          class="text-ink-muted"
        >›</span>
      </li>
      <li v-if="current">
        <span
          aria-current="page"
          class="text-ink"
        >{{ current.label }}</span>
      </li>
    </ol>
  </nav>
</template>
