<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import SegmentedControl from './SegmentedControl.vue'
import { formatDuration, formatTimeRemaining, laneWidthFor, ACCESS_VIEW_KEY } from './timeRemaining'
import type { TimeRemainingRow, TimeRemainingView } from './timeRemaining'

// The trip a plotted isochrone describes, drawn one line at a time as a
// branching graph in the manner of a commit graph. Purely presentational: the
// caller turns a chain response into views, rows and lanes with the module
// beside this one, so nothing here knows about slugs, waits, or the wire.
const props = defineProps<{
  views: TimeRemainingView[]
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

// Which line is being read. Held here rather than raised, the way the
// neighbouring card holds which direction each of its groups is read in.
//
// It opens on the first service rather than on the access leg, which is listed
// first because it comes first but is the least of what the card has to say —
// the stations a rider can walk to are mostly the same ones the lines below are
// boarded at.
const defaultView = computed(() =>
  Math.max(0, props.views.findIndex((view) => view.key !== ACCESS_VIEW_KEY)),
)
const chosen = ref(0)
const view = computed(() => props.views[chosen.value] ?? props.views[0])
const rows = computed(() => view.value?.rows ?? [])

const laneWidth = computed(() => laneWidthFor(view.value?.laneCount ?? 1))
const graphWidth = computed(() => Math.max(view.value?.laneCount ?? 1, 1) * laneWidth.value)
const laneX = (lane: number): number => lane * laneWidth.value + laneWidth.value / 2

const listEl = ref<HTMLElement | null>(null)

// A fresh plot has its own lines, and the one being read may not be among them.
watch(() => props.views, () => { chosen.value = defaultView.value }, { immediate: true })

// The bar the branches leave along, spanning the lanes they leave for. A lane
// freed by a branch that ended above can be reused to the left of this row's
// own, so the span is taken from both ends rather than measured outward.
function forkBarStyle(row: TimeRemainingRow): Record<string, string> {
  const xs = row.forks.map(laneX)
  const left = Math.min(...xs)
  return {
    left: `${left}px`,
    width: `${Math.max(...xs) - left}px`,
    top: `${NODE_BAND_PX / 2}px`,
  }
}

function isExpanded(row: TimeRemainingRow): boolean {
  return row.slug !== null && row.slug === props.activeSlug
}

function activate(row: TimeRemainingRow): void {
  emit('activate', row.slug)
}

// A map hover has to answer somewhere visible: the station it names may be on
// a line this card is not showing, and on a large scenario its row is often
// below the fold of the card's own scroller.
watch(
  () => [props.activeSlug, props.activeFromMap] as const,
  async ([slug, fromMap]) => {
    if (!slug || !fromMap) return
    const showing = props.views[chosen.value]
    if (!showing?.rows.some((row) => row.slug === slug)) {
      const found = props.views.findIndex((candidate) => candidate.rows.some((row) => row.slug === slug))
      if (found >= 0) chosen.value = found
    }
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

    <!-- A trip over one line has nothing to switch between. -->
    <SegmentedControl
      v-if="props.views.length > 1"
      v-model="chosen"
      class="mt-3"
      :options="props.views.map((_, index) => index)"
      :format-option="(index: number) => props.views[index].label"
      name="time-remaining-service"
      testid="time-remaining-service"
    />

    <ul
      ref="listEl"
      class="mt-3 flex max-h-[26rem] list-none flex-col overflow-y-auto p-0"
    >
      <li
        v-for="row in rows"
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
        <!-- The connector column, drawn entirely in absolutely positioned
             boxes anchored to the row's own edges. Nothing here scrolls and
             nothing is measured: every line either spans the row top to bottom
             or hangs off one edge, so a row that grows under the pointer
             lengthens its lines instead of re-routing them. -->
        <div
          class="relative shrink-0"
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
          <!-- Where a row branches, the branches leave along one horizontal bar
               level with the node and then drop straight down their own lanes.
               An elbow rather than a fan of diagonals: a diagonal's angle
               depends on how tall the row is, so it had to be redrawn every
               time a row expanded, and it needed an SVG stretched across the
               whole column to live in. These are two plain boxes, and the
               bar is the only part that knows anything about lane positions. -->
          <span
            v-if="row.forks.length > 1"
            class="absolute h-px bg-border"
            :style="forkBarStyle(row)"
          />
          <!-- The drop down each branch's lane, including this row's own —
               anchored to the bottom edge, which is what makes it stretch. -->
          <span
            v-for="lane in row.forks"
            :key="`fork-${lane}`"
            class="absolute w-px bg-border"
            :style="{ left: `${laneX(lane)}px`, top: `${NODE_BAND_PX / 2}px`, bottom: '0' }"
          />
          <span
            class="absolute size-1.5 rounded-full bg-ink-muted"
            :style="{ left: `${laneX(row.lane) - 3}px`, top: `${NODE_BAND_PX / 2 - 3}px` }"
            data-testid="time-remaining-node"
          />
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

          <!-- The detail grows out of the row rather than appearing at full
               height, so a pointer travelling down the list can see which row
               moved and why. Animated on grid rows rather than on height,
               because the detail's height depends on how much this particular
               station has to say and nothing here knows it in advance; a
               0fr→1fr track resolves to that height without it being named.
               Held to the same duration and easing as the rest of the page,
               and skipped outright for a reader who asked for less motion. -->
          <Transition
            enter-active-class="transition-[grid-template-rows,opacity] duration-200 ease-(--ease-smooth) motion-reduce:transition-none"
            leave-active-class="transition-[grid-template-rows,opacity] duration-200 ease-(--ease-smooth) motion-reduce:transition-none"
            enter-from-class="grid-rows-[0fr] opacity-0"
            enter-to-class="grid-rows-[1fr] opacity-100"
            leave-from-class="grid-rows-[1fr] opacity-100"
            leave-to-class="grid-rows-[0fr] opacity-0"
          >
            <div
              v-if="isExpanded(row)"
              class="grid grid-rows-[1fr]"
            >
              <dl
                class="font-body text-micro flex min-h-0 flex-col gap-0.5 overflow-hidden pt-1 text-ink-muted"
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
          </Transition>
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
