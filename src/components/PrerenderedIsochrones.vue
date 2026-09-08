<script setup lang="ts">
import { ref } from 'vue'
import { useOwnedList } from '../composables/useOwnedList'
import { latestAttempt } from '../composables/latestAttempt'
import {
  fetchPrerenderedIsochrone,
  listPrerenderedIsochrones,
  type PrerenderedIsochroneSummary,
} from '../api/prerenderedIsochrones'
import type { ChainResponse } from '../fixtures/isochrone'

const props = defineProps<{ slug: string; selectedId: string | null }>()

const emit = defineEmits<{
  select: [result: ChainResponse]
  'update:selectedId': [id: string | null]
}>()

const { items } = useOwnedList(() => listPrerenderedIsochrones(props.slug))

const pendingId = ref<string | null>(null)
const detailError = ref<string | null>(null)

const attempt = latestAttempt()

const OUTDATED_HINT =
  'Plotted before the scenario’s current routes and services, so it may be out of date.'

async function choose(entry: PrerenderedIsochroneSummary): Promise<void> {
  const mine = attempt.begin()
  pendingId.value = entry.id
  detailError.value = null
  try {
    const detail = await fetchPrerenderedIsochrone(entry.id)
    if (!attempt.isCurrent(mine)) return
    pendingId.value = null
    emit('update:selectedId', entry.id)
    emit('select', detail.result)
  } catch (e) {
    console.error(e)
    if (!attempt.isCurrent(mine)) return
    pendingId.value = null
    detailError.value = `Couldn't load "${entry.label}". Please try again.`
  }
}

function summarise(entry: PrerenderedIsochroneSummary): string {
  return `${entry.budget_mins} min · ${entry.mode}`
}
</script>

<template>
  <section
    v-if="items.length"
    class="rounded-(--radius-box) border border-border bg-surface p-4"
    data-testid="prerendered-isochrones"
  >
    <h2 class="font-display text-h3 text-ink-true">
      Pre-rendered isochrones
    </h2>

    <ul class="mt-3 flex flex-col gap-2">
      <li
        v-for="entry in items"
        :key="entry.id"
      >
        
        <button
          type="button"
          class="group font-body text-body flex w-full cursor-pointer flex-col gap-1 rounded-(--radius-field) border border-border bg-white px-3 py-2 text-left text-ink transition-colors duration-200 ease-(--ease-smooth) hover:border-coral disabled:cursor-progress disabled:opacity-60 aria-pressed:border-coral aria-pressed:bg-coral aria-pressed:text-white"
          :disabled="pendingId === entry.id"
          :aria-busy="pendingId === entry.id"
          :aria-pressed="selectedId === entry.id"
          data-testid="prerendered-entry"
          @click="choose(entry)"
        >
          <span class="flex flex-wrap items-center gap-2">
            {{ entry.label }}
            <span
              v-if="entry.outdated"
              class="font-display text-micro rounded-(--radius-field) border border-apricot bg-apricot/15 px-1.5 py-0.5 text-ink uppercase group-aria-pressed:border-white/70 group-aria-pressed:bg-white/25 group-aria-pressed:text-white"
              :title="OUTDATED_HINT"
              :aria-label="`Out of date — ${OUTDATED_HINT}`"
              data-testid="prerendered-outdated"
            >
              Out of date
            </span>
          </span>
          <span
            class="text-micro text-ink-muted uppercase group-aria-pressed:text-white/80"
            data-testid="prerendered-entry-detail"
          >
            {{ pendingId === entry.id ? 'Loading…' : summarise(entry) }}
          </span>
        </button>
      </li>
    </ul>

    <p
      v-if="detailError"
      class="font-body text-caption mt-3 text-coral"
      role="alert"
      data-testid="prerendered-detail-error"
    >
      {{ detailError }}
    </p>
  </section>
</template>
