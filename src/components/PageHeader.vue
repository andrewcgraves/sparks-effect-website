<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  title: string
  subtitle?: string
  slug?: string
  subtitleTestid?: string
}>()

const heading = ref<HTMLHeadingElement | null>(null)

// tabindex="-1" on every title, so a page can send a keyboard user's focus
// back to its heading when the control they were on goes away.
defineExpose({ focus: () => heading.value?.focus() })
</script>

<template>
  <div class="flex items-start justify-between gap-4">
    <hgroup class="flex flex-col gap-2">
      <h1
        ref="heading"
        class="t-display text-ink-true"
        tabindex="-1"
      >
        {{ title }}
      </h1>
      <p
        v-if="$slots.subtitle || subtitle"
        class="t-meta text-ink-muted"
        :data-testid="subtitleTestid"
      >
        <slot name="subtitle">
          {{ subtitle }}
        </slot>
      </p>
      <p
        v-if="slug"
        class="t-meta text-ink-muted"
      >
        {{ slug }}
      </p>
    </hgroup>
    <div
      v-if="$slots.actions"
      class="flex items-start gap-6"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
