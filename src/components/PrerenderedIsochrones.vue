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

/**
 * The isochrones a seeded scenario already ships plotted, offered alongside the
 * generate form rather than in place of it: picking one draws immediately
 * instead of spending a routing job and the wait that comes with it.
 *
 * It owns its own fetch, so a scenario with none of these — or a list request
 * that fails — costs the page nothing: the card is simply not there, and the
 * form beside it is unaffected either way.
 */
const props = defineProps<{ slug: string; selectedId: string | null }>()

const emit = defineEmits<{
  select: [result: ChainResponse]
  'update:selectedId': [id: string | null]
}>()

// useOwnedList over a closure rather than a slug-taking fetcher: the slug is a
// prop, so there is nothing for the composable to pass that this cannot close
// over. items stays empty while loading and after a failure, which is exactly
// the three cases where this card renders nothing at all.
const { items } = useOwnedList(() => listPrerenderedIsochrones(props.slug))

// Which entry's chain is being fetched, so only that row reports itself busy.
const pendingId = ref<string | null>(null)
const detailError = ref<string | null>(null)

// A rider can click a second entry before the first answers, and the payloads
// here are large enough for that to be the common case rather than a race to
// dismiss: whichever chain was asked for last is the one that gets drawn.
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
        <!-- The pick that is currently drawn is tinted rather than filled: the
             outdated chip and the muted second line both still have to be
             legible on it, which a solid coral ground would not allow. -->
        <button
          type="button"
          class="font-body text-body flex w-full cursor-pointer flex-col gap-1 rounded-(--radius-field) border border-border bg-white px-3 py-2 text-left text-ink transition-colors duration-200 ease-(--ease-smooth) hover:border-coral disabled:cursor-progress disabled:opacity-60 aria-pressed:border-coral aria-pressed:bg-coral/10"
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
              class="font-display text-micro rounded-(--radius-field) border border-apricot bg-apricot/15 px-1.5 py-0.5 text-ink uppercase"
              :title="OUTDATED_HINT"
              :aria-label="`Out of date — ${OUTDATED_HINT}`"
              data-testid="prerendered-outdated"
            >
              Out of date
            </span>
          </span>
          <span
            class="text-micro text-ink-muted uppercase"
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
