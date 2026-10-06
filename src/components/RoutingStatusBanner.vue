<script setup lang="ts">
import { computed } from 'vue'
import type { RoutingStatus } from '../api/routingStatus'

const props = withDefaults(defineProps<{ status: RoutingStatus; examples?: boolean }>(), { examples: false })

// Where there are no saved examples to offer, the banner can only explain.
const offlineMessage = computed(() =>
  props.examples
    ? 'Live routing is offline right now. Here are some saved examples.'
    : 'Live routing is offline right now. New splash zones can’t be plotted until it’s back.',
)
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
