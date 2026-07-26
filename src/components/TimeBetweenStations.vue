<script setup lang="ts">
import { ref } from 'vue'
import { formatRunTime } from './stationTimes'
import type { StationTimeGroup } from './stationTimes'

// The compile table's adjacent-segment run times, on the isochrone screens.
// Purely presentational: callers turn their own data — a compiled graph on the
// authored pages, seeded travel times on the scenario page — into groups, so
// this knows only about hops and the directions they can be read in.
const props = defineProps<{
  groups: StationTimeGroup[]
  loading?: boolean
}>()

// Which direction each group is being read in, by group key. Absent means the
// first, so a group arrives in stop order without seeding this.
const chosen = ref<Record<string, number>>({})

function chosenIndex(group: StationTimeGroup): number {
  return chosen.value[group.key] ?? 0
}

function choose(group: StationTimeGroup, index: number): void {
  chosen.value = { ...chosen.value, [group.key]: index }
}
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

    <template v-else>
      <div
        v-for="group in props.groups"
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

        <!-- A service compiled one way has nothing to toggle between. -->
        <div
          v-if="group.directions.length > 1"
          class="mt-2 flex flex-wrap gap-2"
        >
          <button
            v-for="(direction, index) in group.directions"
            :key="direction.terminus"
            type="button"
            class="font-display text-btn cursor-pointer rounded-(--radius-field) border border-border px-3 py-1.5 uppercase hover:bg-white aria-pressed:border-coral aria-pressed:bg-coral aria-pressed:text-white"
            :aria-pressed="chosenIndex(group) === index"
            data-testid="direction-toggle"
            @click="choose(group, index)"
          >
            To {{ direction.terminus }}
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
              v-for="(row, index) in group.directions[chosenIndex(group)].rows"
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
    </template>
  </section>
</template>
