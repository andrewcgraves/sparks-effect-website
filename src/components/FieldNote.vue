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
    class="font-body text-caption text-ink-muted"
    :data-testid="`${testid}-help`"
  >
    {{ help }}
  </p>
  <p
    v-if="warning"
    class="font-body text-caption flex items-center gap-2 text-ink"
    role="status"
    :data-testid="`${testid}-warning`"
  >
    <StatusDot tone="caution" />
    {{ warning }}
  </p>
</template>
