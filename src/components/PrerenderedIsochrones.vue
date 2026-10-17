<script setup lang="ts">
import { ref, watch } from 'vue'
import { useOwnedList } from '../composables/useOwnedList'
import { latestAttempt } from '../composables/latestAttempt'
import {
  fetchPrerenderedIsochrone,
  listPrerenderedIsochrones,
  type PrerenderedIsochrone,
  type PrerenderedIsochroneSummary,
} from '../api/prerenderedIsochrones'
import { modeLabel } from '../copy/modes'
import { PRESSED_CHOICE_CLASS } from './buttonStyles'
import Tag from './Tag.vue'

const props = defineProps<{ slug: string; selectedId: string | null }>()

const emit = defineEmits<{
  select: [entry: PrerenderedIsochrone]
  'update:selectedId': [id: string | null]
  available: [hasAny: boolean]
}>()

const { items, loading } = useOwnedList(() => listPrerenderedIsochrones(props.slug))

// Reported once the list has answered, not while it is still empty for want of
// an answer: the page promises examples only when there are some to show.
watch(loading, (stillLoading) => {
  if (!stillLoading) emit('available', items.value.length > 0)
})

const pendingId = ref<string | null>(null)
const detailError = ref<string | null>(null)

const attempt = latestAttempt()

// The API calls an entry outdated once a line has joined or left the network,
// or a member line has been edited, since it was plotted.
const OUTDATED_HINT =
  'Plotted before this network’s lines last changed, so it may be out of date.'

async function choose(entry: PrerenderedIsochroneSummary): Promise<void> {
  const mine = attempt.begin()
  pendingId.value = entry.id
  detailError.value = null
  try {
    const detail = await fetchPrerenderedIsochrone(entry.id)
    if (!attempt.isCurrent(mine)) return
    pendingId.value = null
    emit('update:selectedId', entry.id)
    emit('select', detail)
  } catch (e) {
    console.error(e)
    if (!attempt.isCurrent(mine)) return
    pendingId.value = null
    detailError.value = `Couldn't load "${entry.label}". Please try again.`
  }
}

// Labels are written to stand alone ("Fresno - 120 min by transit"), but each
// tile already says the travel time and mode underneath, so a trailing
// " - N min …" is dropped from the name rather than said twice.
function placeName(entry: PrerenderedIsochroneSummary): string {
  return entry.label.replace(/\s+-\s+\d+\s*min\b.*$/, '')
}

function summarise(entry: PrerenderedIsochroneSummary): string {
  return `${entry.budget_mins} min · ${modeLabel(entry.mode)}`
}
</script>

<template>
  <div
    v-if="items.length"
    data-testid="prerendered-isochrones"
  >
    <ul class="grid grid-cols-2 gap-1.5">
      <li
        v-for="entry in items"
        :key="entry.id"
      >
        <button
          type="button"
          class="t-field flex size-full cursor-pointer flex-col gap-0.5 rounded-(--radius-field) border border-border bg-white px-2.5 py-1.5 text-left leading-tight text-ink transition-colors duration-200 ease-(--ease-smooth) hover:border-coral disabled:cursor-progress disabled:opacity-60"
          :class="PRESSED_CHOICE_CLASS"
          :disabled="pendingId === entry.id"
          :aria-busy="pendingId === entry.id"
          :aria-pressed="selectedId === entry.id"
          :title="entry.label"
          data-testid="prerendered-entry"
          @click="choose(entry)"
        >
          <span class="flex flex-wrap items-center gap-1">
            {{ placeName(entry) }}
            <Tag
              v-if="entry.outdated"
              tone="caution"
              :title="OUTDATED_HINT"
              :aria-label="`Out of date — ${OUTDATED_HINT}`"
              data-testid="prerendered-outdated"
            >
              Out of date
            </Tag>
          </span>
          <span
            class="t-meta text-ink-muted"
            data-testid="prerendered-entry-detail"
          >
            {{ pendingId === entry.id ? 'Loading…' : summarise(entry) }}
          </span>
        </button>
      </li>
    </ul>

    <p
      v-if="detailError"
      class="t-error mt-3"
      role="alert"
      data-testid="prerendered-detail-error"
    >
      {{ detailError }}
    </p>
  </div>
</template>
