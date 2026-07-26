<script setup lang="ts">
import { ref } from 'vue'
import { formatRunTime } from './stationTimes'
import type { StationTimeGroup, StationTimeRow } from './stationTimes'

// The compile table's adjacent-segment run times, on the isochrone screens.
// Purely presentational: callers turn their own data — a compiled graph on the
// authored pages, seeded travel times on the scenario page — into groups, so
// this knows only about hops and the direction they read in.
const props = defineProps<{
  groups: StationTimeGroup[]
  loading?: boolean
}>()

// Which groups are being read against their stop order, keyed by group. Absent
// means forward, so a group arrives in stop order without seeding this.
const reversed = ref<Record<string, boolean>>({})

function isReversed(group: StationTimeGroup): boolean {
  return reversed.value[group.key] === true
}

function setReversed(group: StationTimeGroup, value: boolean): void {
  reversed.value = { ...reversed.value, [group.key]: value }
}

// Reading the chain the other way visits the hops back to front and enters
// each one from the far end, so both the order and the endpoints flip.
function rowsFor(group: StationTimeGroup): StationTimeRow[] {
  if (!isReversed(group)) return group.rows
  return [...group.rows].reverse().map((row) => ({ from: row.to, to: row.from, seconds: row.seconds }))
}

const TOGGLE_CLASS = 'font-display text-btn cursor-pointer rounded-(--radius-field) border border-border px-2 py-1 uppercase'
</script>

<template>
  <section
    class="rounded-(--radius-box) border border-border bg-surface p-4"
    data-testid="time-between-stations"
  >
    <h2 class="font-display text-h3 text-ink-true">
      Time between stations
    </h2>

    <p
      v-if="props.loading"
      class="font-body text-caption mt-2 text-ink-muted italic"
      data-testid="station-times-loading"
    >
      Loading run times…
    </p>

    <p
      v-else-if="!props.groups.length"
      class="font-body text-caption mt-2 text-ink-muted italic"
      data-testid="station-times-empty"
    >
      No run times for this scenario yet.
    </p>

    <div
      v-for="group in props.groups"
      v-else
      :key="group.key"
      class="mt-3"
      data-testid="station-time-group"
    >
      <h3
        v-if="group.label"
        class="font-display text-btn text-ink-true uppercase"
        data-testid="station-time-group-label"
      >
        {{ group.label }}
      </h3>

      <div
        v-if="group.termini"
        class="mt-2 flex gap-2"
      >
        <button
          v-for="(terminus, index) in [group.termini[1], group.termini[0]]"
          :key="terminus"
          type="button"
          :class="[TOGGLE_CLASS, isReversed(group) === (index === 1) ? 'bg-white text-ink-true' : 'text-ink-muted']"
          :aria-pressed="isReversed(group) === (index === 1)"
          data-testid="direction-toggle"
          @click="setReversed(group, index === 1)"
        >
          To {{ terminus }}
        </button>
      </div>

      <table class="font-body text-caption mt-2 w-full text-ink">
        <thead>
          <tr class="text-ink-muted">
            <th class="text-left font-normal">
              From
            </th>
            <th class="text-left font-normal">
              To
            </th>
            <th class="text-left font-normal">
              Run time
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in rowsFor(group)"
            :key="index"
            data-testid="station-time-row"
          >
            <td>{{ row.from }}</td>
            <td>{{ row.to }}</td>
            <td>{{ formatRunTime(row.seconds) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
