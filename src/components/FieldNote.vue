<script setup lang="ts">
defineProps<{
  help: string
  warning?: string
  testid: string
}>()
</script>

<template>
  <p
    class="t-note text-ink-muted"
    :data-testid="`${testid}-help`"
  >
    {{ help }}
  </p>
  <p
    v-if="warning"
    class="t-meta flex items-center gap-2 text-ink"
    role="status"
    :data-testid="`${testid}-warning`"
  >
    <span
      class="size-2 shrink-0 rounded-full bg-apricot"
      aria-hidden="true"
    />
    {{ warning }}
  </p>
</template>
