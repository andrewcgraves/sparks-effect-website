<script setup lang="ts">
import { computed } from 'vue'
import type { RoutingStatus } from '../api/routingStatus'
import Notice from './Notice.vue'

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
    ? `${OFFLINE} Here are some saved splash zones.`
    : `${OFFLINE} New splash zones can’t be plotted until it’s back.`
})
</script>

<template>
  <Notice
    v-if="status === 'offline'"
    tone="caution"
    size="banner"
    data-testid="routing-status"
  >
    {{ offlineMessage }}
  </Notice>
  <p
    v-else-if="status === 'degraded'"
    class="font-body text-caption text-ink-muted italic"
    role="status"
    data-testid="routing-status"
  >
    Live routing is busy right now, so plotting may be slow.
  </p>
</template>
