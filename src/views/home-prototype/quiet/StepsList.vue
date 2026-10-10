<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. The three "how it works" steps, in the one
// style the quiet variants share. The numbers stay because the steps are a
// real sequence; they are set in body type at body size, not as decoration.
import { STEPS } from '../homePrototypeData'
import { INLINE_LINK_CLASS } from '../../../components/linkStyles'

withDefaults(defineProps<{ layout?: 'column' | 'row' }>(), { layout: 'column' })
</script>

<template>
  <div>
    <ol
      class="grid gap-x-8 gap-y-5"
      :class="layout === 'row' ? 'md:grid-cols-3' : ''"
    >
      <li
        v-for="(step, i) in STEPS"
        :key="step.title"
        class="grid grid-cols-[1.5rem_1fr] gap-x-2"
      >
        <span class="font-body text-body text-ink-muted">{{ i + 1 }}.</span>
        <span class="font-display text-body font-bold text-ink-true">{{ step.title }}</span>
        <span class="font-body text-caption col-start-2 mt-0.5 text-ink-muted">{{ step.body }}</span>
      </li>
    </ol>
    <p class="font-body text-caption mt-5 text-ink-muted">
      <router-link
        to="/how-it-works"
        :class="INLINE_LINK_CLASS"
      >
        How it works
      </router-link>
    </p>
  </div>
</template>
