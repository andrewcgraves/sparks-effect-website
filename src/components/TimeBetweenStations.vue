<script setup lang="ts">
import { ref } from 'vue'
import SegmentedControl from './SegmentedControl.vue'
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'
import { directionSeconds, directionStops, formatRunTime, formatTotalTime } from './stationTimes'
import type { StationTimeDirection, StationTimeGroup } from './stationTimes'

const props = defineProps<{
  groups: StationTimeGroup[]
  loading?: boolean
}>()

const chosen = ref<Record<string, number>>({})

function chosenIndex(group: StationTimeGroup): number {
  return chosen.value[group.key] ?? 0
}

function choose(group: StationTimeGroup, index: number): void {
  chosen.value = { ...chosen.value, [group.key]: index }
}

function chosenDirection(group: StationTimeGroup): StationTimeDirection {
  return group.directions[chosenIndex(group)]
}

function groupTitle(group: StationTimeGroup): string {
  if (group.label) return group.label
  const stops = directionStops(group.directions[0])
  return `${stops[0]} – ${stops[stops.length - 1]}`
}

function groupSummary(group: StationTimeGroup): string {
  const direction = chosenDirection(group)
  const stops = directionStops(direction).length
  return `${stops} stops · ${formatTotalTime(directionSeconds(direction))}`
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

    <LoadingRegion
      v-if="props.loading"
      label="Loading run times"
      class="mt-3 flex flex-col gap-1"
      data-testid="station-times-loading"
    >
      <!-- A summary row plus three stops, in the list's caption type. -->
      <div
        v-for="row in 4"
        :key="row"
        class="font-body text-caption grid grid-cols-[1rem_1fr_auto] gap-x-3"
      >
        <SkeletonShape class="w-2" />
        <SkeletonShape class="w-2/3" />
        <SkeletonShape class="w-10" />
      </div>
    </LoadingRegion>

    <p
      v-else-if="!props.groups.length"
      class="font-body text-caption mt-2 text-ink-muted italic"
      data-testid="station-times-empty"
    >
      No run times yet.
    </p>

    <div
      v-else
      class="mt-3 divide-y divide-border border-t border-border"
    >
      <details
        v-for="(group, groupIndex) in props.groups"
        :key="group.key"
        class="group/station-times"
        :open="groupIndex === 0"
        data-testid="station-time-group"
      >
        <summary
          class="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 [&::-webkit-details-marker]:hidden"
        >
          <span
            aria-hidden="true"
            class="inline-block w-2 text-ink-muted transition-transform duration-200 group-open/station-times:rotate-90"
          >›</span>
          <h3
            class="font-display text-btn min-w-0 flex-[1_1_12rem] text-ink-true uppercase"
            data-testid="station-time-group-label"
          >
            {{ groupTitle(group) }}
          </h3>
          <span
            class="font-body text-caption ml-auto shrink-0 pl-5 text-ink-muted tabular-nums"
            data-testid="station-time-group-summary"
          >
            {{ groupSummary(group) }}
          </span>
        </summary>

        <div class="pb-3 pl-5">
          <SegmentedControl
            v-if="group.directions.length > 1"
            :model-value="chosenIndex(group)"
            :options="group.directions.map((_, index) => index)"
            :format-option="(index: number) => `To ${group.directions[index].terminus}`"
            label="Direction"
            :name="`station-times-direction-${group.key}`"
            testid="direction-toggle"
            @update:model-value="(index: number) => choose(group, index)"
          />

          <ol
            class="mt-3 flex list-none flex-col p-0"
            data-testid="station-time-stops"
          >
            <li
              v-for="(stop, index) in directionStops(chosenDirection(group))"
              :key="index"
              class="flex items-stretch gap-3"
              data-testid="station-time-stop"
            >
              <!-- The rail, drawn as Time remaining draws its own: a dot per stop,
                   joined to the next stop's dot by a line through the row below. -->
              <span
                aria-hidden="true"
                class="relative w-3 shrink-0"
              >
                <span
                  v-if="index > 0"
                  class="absolute top-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-border"
                />
                <span
                  v-if="index < chosenDirection(group).rows.length"
                  class="absolute top-1/2 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border"
                />
                <span class="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-ink-muted" />
              </span>
              <span
                class="font-body text-caption min-w-0 flex-1 truncate py-1 text-ink"
                data-testid="station-time-stop-name"
              >{{ stop }}</span>
              <!-- Each run time is shifted half a row down so it sits between the
                   two stops it joins rather than beside either one. -->
              <span
                v-if="index < chosenDirection(group).rows.length"
                class="font-body text-caption shrink-0 translate-y-1/2 py-1 text-right tabular-nums text-ink-true"
                data-testid="station-time-hop"
              >
                <span class="sr-only">to {{ chosenDirection(group).rows[index].to }}, run time </span>
                {{ formatRunTime(chosenDirection(group).rows[index].seconds) }}
              </span>
            </li>
          </ol>
        </div>
      </details>
    </div>
  </section>
</template>
