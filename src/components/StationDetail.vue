<script setup lang="ts">
import { formatDuration, formatProgressPercent, formatTimeRemaining } from './timeRemaining'
import type { RowDetail } from './timeRemaining'

const props = defineProps<{
  detail: RowDetail
  rodeInFrom: string | null
}>()
</script>

<template>
  <dl
    class="t-meta flex flex-col gap-0.5 text-ink-muted"
    data-testid="time-remaining-detail"
  >
    <div v-if="props.detail.rideSecs !== undefined">
      <dt class="inline">
        {{ props.rodeInFrom ? `Rode in from ${props.rodeInFrom}` : 'Rode in' }}
      </dt>
      <dd class="ml-1 inline">
        {{ formatDuration(props.detail.rideSecs) }}
      </dd>
    </div>
    <div v-if="props.detail.arrivalSecs !== undefined">
      <dt class="inline">
        Arrived with
      </dt>
      <dd class="ml-1 inline">
        {{ formatTimeRemaining(props.detail.arrivalSecs) }} left
      </dd>
    </div>
    <div v-if="props.detail.dwellSecs !== undefined">
      <dt class="inline">
        Stopped here for
      </dt>
      <dd class="ml-1 inline">
        {{ formatDuration(props.detail.dwellSecs) }}
      </dd>
    </div>
    <div v-if="props.detail.transferFrom">
      <dt class="inline">
        Changed from
      </dt>
      <dd class="ml-1 inline">
        {{ props.detail.transferFrom }}
      </dd>
    </div>
    <div v-if="props.detail.progressTo && props.detail.progressFraction !== undefined">
      <dt class="inline">
        Got {{ formatProgressPercent(props.detail.progressFraction) }} of the way toward
      </dt>
      <dd class="ml-1 inline">
        {{ props.detail.progressTo }}
      </dd>
    </div>
  </dl>
</template>
