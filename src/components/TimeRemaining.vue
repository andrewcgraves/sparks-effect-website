<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { formatDuration, formatTimeRemaining, laneWidthFor, GRAPH_COLUMN_PX } from './timeRemaining'
import type { TimeRemainingRow } from './timeRemaining'

// The trip a plotted isochrone describes, drawn as a branching graph in the
// manner of a commit graph. Purely presentational: the caller turns a chain
// response into rows and lanes with the module beside this one, so nothing here
// knows about slugs, waits, or the wire.
const props = defineProps<{
  rows: TimeRemainingRow[]
  laneCount: number
  // The station highlighted anywhere on the page. The row for it is expanded,
  // wherever the highlight came from, so the map and this card always agree.
  activeSlug: string | null
  // Whether that highlight came from the map. A map hover scrolls its row into
  // view; one the rider made in here never does, because the list moving out
  // from under their own cursor is the one thing worse than not seeing it.
  activeFromMap?: boolean
}>()

const emit = defineEmits<{ activate: [slug: string | null] }>()

// Where a row's node sits, and where its connectors start and stop. The node
// band is a fixed height so the dot stays put and stays round while an expanded
// row grows beneath it — the connectors below stretch instead of re-routing.
const NODE_BAND_PX = 26

const laneWidth = computed(() => laneWidthFor(props.laneCount))
const graphWidth = computed(() => Math.max(props.laneCount, 1) * laneWidth.value)
const laneX = (lane: number): number => lane * laneWidth.value + laneWidth.value / 2

const listEl = ref<HTMLElement | null>(null)

function isExpanded(row: TimeRemainingRow): boolean {
  return row.slug !== null && row.slug === props.activeSlug
}

function activate(row: TimeRemainingRow): void {
  emit('activate', row.slug)
}

// A map hover has to answer somewhere visible, and on a large scenario the row
// it names is often below the fold of this card's own scroller.
watch(
  () => [props.activeSlug, props.activeFromMap] as const,
  async ([slug, fromMap]) => {
    if (!slug || !fromMap) return
    await nextTick()
    // Matched in script rather than through a selector, because a slug is the
    // graph's own key and nothing promises it is safe to interpolate into one.
    const rows = listEl.value?.querySelectorAll('[data-station-slug]') ?? []
    for (const row of rows) {
      if (row.getAttribute('data-station-slug') === slug) {
        row.scrollIntoView({ block: 'nearest' })
        return
      }
    }
  },
)
</script>

<template>
  <section
    class="rounded-(--radius-box) border border-border bg-surface p-4"
    data-testid="time-remaining"
  >
    <h2 class="font-display text-h3 text-ink-true">
      Time remaining
    </h2>

    <ul
      ref="listEl"
      class="mt-3 flex max-h-[26rem] list-none flex-col overflow-y-auto p-0"
    >
      <li
        v-for="row in props.rows"
        :key="row.key"
        class="flex cursor-default items-stretch gap-3 rounded-(--radius-field) focus:outline-none focus-visible:ring-1 focus-visible:ring-coral"
        :class="isExpanded(row) ? 'bg-white' : ''"
        tabindex="0"
        :data-station-slug="row.slug ?? undefined"
        data-testid="time-remaining-row"
        @mouseenter="activate(row)"
        @mouseleave="emit('activate', null)"
        @focus="activate(row)"
        @blur="emit('activate', null)"
      >
        <!-- The connector column scrolls on its own once its lanes have
             narrowed as far as they legibly can, so the names and the times
             beside it stay anchored however deeply the graph branches. -->
        <div
          class="shrink-0 overflow-x-auto"
          :style="{ maxWidth: `${GRAPH_COLUMN_PX}px` }"
        >
          <div
            class="relative h-full"
            :style="{ width: `${graphWidth}px` }"
          >
            <!-- Lanes reserved for a row further down, passing this one by. -->
            <span
              v-for="lane in row.through"
              :key="`through-${lane}`"
              class="absolute w-px bg-border"
              :style="{ left: `${laneX(lane)}px`, top: '0', bottom: '0' }"
            />
            <!-- The connector arriving from above, stopping at the node. -->
            <span
              v-if="row.incoming"
              class="absolute w-px bg-border"
              :style="{ left: `${laneX(row.lane)}px`, top: '0', height: `${NODE_BAND_PX / 2}px` }"
            />
            <!-- A branch carrying straight on down this row's own lane. -->
            <span
              v-if="row.forks.includes(row.lane)"
              class="absolute w-px bg-border"
              :style="{ left: `${laneX(row.lane)}px`, top: `${NODE_BAND_PX / 2}px`, bottom: '0' }"
            />
            <!-- Branches leaving for a lane of their own. Drawn in one stretched
                 box below the node so an expanding row lengthens them rather
                 than re-routing the graph under the pointer. -->
            <svg
              v-if="row.forks.some((lane) => lane !== row.lane)"
              class="absolute"
              :style="{ left: '0', right: '0', top: `${NODE_BAND_PX / 2}px`, bottom: '0' }"
              :viewBox="`0 0 ${graphWidth} 100`"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line
                v-for="lane in row.forks.filter((l) => l !== row.lane)"
                :key="`fork-${lane}`"
                :x1="laneX(row.lane)"
                y1="0"
                :x2="laneX(lane)"
                y2="100"
                class="stroke-border"
                stroke-width="1"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <span
              class="absolute size-1.5 rounded-full bg-ink-muted"
              :style="{ left: `${laneX(row.lane) - 3}px`, top: `${NODE_BAND_PX / 2 - 3}px` }"
              data-testid="time-remaining-node"
            />
          </div>
        </div>

        <div class="min-w-0 flex-1 py-1">
          <p class="font-body text-caption truncate text-ink">
            {{ row.label }}
          </p>
          <p
            v-if="row.flag"
            class="font-body text-micro text-ink-muted uppercase"
            data-testid="time-remaining-flag"
          >
            {{ row.flag }}
          </p>

          <dl
            v-if="isExpanded(row)"
            class="font-body text-micro mt-1 flex flex-col gap-0.5 text-ink-muted"
            data-testid="time-remaining-detail"
          >
            <div v-if="row.detail.accessTo">
              <dt class="inline">
                {{ row.flag }} to {{ row.detail.accessTo }}:
              </dt>
              <dd class="ml-1 inline">
                {{ formatDuration(row.detail.accessSecs ?? 0) }}
              </dd>
            </div>
            <div v-if="row.detail.arrivalSecs !== undefined">
              <dt class="inline">
                Arrived with
              </dt>
              <dd class="ml-1 inline">
                {{ formatTimeRemaining(row.detail.arrivalSecs) }} left
              </dd>
            </div>
            <div v-if="row.detail.dwellSecs !== undefined">
              <dt class="inline">
                Dwell
              </dt>
              <dd class="ml-1 inline">
                {{ formatDuration(row.detail.dwellSecs) }}
              </dd>
            </div>
            <div v-if="row.detail.transferFrom">
              <dt class="inline">
                Change from
              </dt>
              <dd class="ml-1 inline">
                {{ row.detail.transferFrom }}
              </dd>
            </div>
            <div v-if="row.detail.rideSecs !== undefined">
              <dt class="inline">
                Ride in
              </dt>
              <dd class="ml-1 inline">
                {{ formatDuration(row.detail.rideSecs) }}
              </dd>
            </div>
          </dl>
        </div>

        <p
          class="font-body text-caption shrink-0 py-1 text-right tabular-nums text-ink-true"
          data-testid="time-remaining-value"
        >
          {{ formatTimeRemaining(row.remainingSecs) }}
        </p>
      </li>
    </ul>
  </section>
</template>
