<script setup lang="ts">
import { ref } from 'vue'
import { TOGGLE_BUTTON_CLASS } from './buttonStyles'
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'
import { formatRunTime } from './stationTimes'
import type { StationTimeGroup } from './stationTimes'

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
      class="mt-3 flex flex-col"
      data-testid="station-times-loading"
    >
      <!-- The table's head row plus three body rows, in its caption type. -->
      <div
        v-for="row in 4"
        :key="row"
        class="font-body text-caption grid grid-cols-3 gap-3"
      >
        <SkeletonShape class="w-2/3" />
        <SkeletonShape class="w-2/3" />
        <SkeletonShape class="w-1/2" />
      </div>
    </LoadingRegion>

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

        
        <div
          v-if="group.directions.length > 1"
          class="mt-2 flex flex-wrap gap-2"
        >
          <button
            v-for="(direction, index) in group.directions"
            :key="direction.terminus"
            type="button"
            :class="TOGGLE_BUTTON_CLASS"
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
