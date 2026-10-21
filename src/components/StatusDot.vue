<script setup lang="ts">
defineProps<{ tone: 'quiet' | 'caution' | 'busy' | 'error' }>()

const TONE_CLASS = {
  quiet: 'bg-ink-faint',
  caution: 'bg-apricot',
  busy: 'animate-pulse bg-coral',
  error: 'bg-error',
}
</script>

<template>
  <span
    :class="['size-2 shrink-0 rounded-full', TONE_CLASS[tone]]"
    aria-hidden="true"
  />
</template>
