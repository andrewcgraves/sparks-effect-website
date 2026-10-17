<script setup lang="ts">
import StatusDot from './StatusDot.vue'

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
    <StatusDot tone="caution" />
    {{ warning }}
  </p>
</template>
