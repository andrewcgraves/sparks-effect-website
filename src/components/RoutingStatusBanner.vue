<script setup lang="ts">
import { computed } from 'vue'
import type { RoutingStatus } from '../api/routingStatus'

const props = withDefaults(
  defineProps<{ status: RoutingStatus; hasExamples?: boolean | null }>(),
  { hasExamples: false },
)

const OFFLINE = 'Live routing is offline right now.'

const offlineMessage = computed(() => {
  // Until the examples have answered, the banner neither promises them nor
  // says there is nothing to offer: either could be contradicted a moment later.
  if (props.hasExamples === null) return OFFLINE
  return props.hasExamples
    ? `${OFFLINE} Here are some saved examples.`
    : `${OFFLINE} New splash zones can’t be plotted until it’s back.`
})
</script>

<template>
  <p
    v-if="status === 'offline'"
    class="font-body text-body rounded-(--radius-box) border border-apricot bg-apricot/15 p-4 text-ink"
    role="status"
    data-testid="routing-status"
  >
    {{ offlineMessage }}
  </p>
  <p
    v-else-if="status === 'degraded'"
    class="font-body text-caption text-ink-muted italic"
    role="status"
    data-testid="routing-status"
  >
    Live routing is busy right now, so plotting may be slow.
  </p>
</template>
