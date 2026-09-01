<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import SegmentedControl from './SegmentedControl.vue'
import TooltipPanel from './TooltipPanel.vue'
import { formatDuration, formatTimeRemaining, laneWidthFor } from './timeRemaining'
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
// The first view is the line that gets the rider furthest, which is the one to
// open on. It used to be the access leg that came first and had to be skipped
// past here; that view is now built only for a trip with no line to offer
// instead, and then it is the only one there is.
const chosen = ref(0)
const view = computed(() => props.views[chosen.value] ?? props.views[0])
const rows = computed(() => view.value?.rows ?? [])

const laneWidth = computed(() => laneWidthFor(view.value?.laneCount ?? 1))
const graphWidth = computed(() => Math.max(view.value?.laneCount ?? 1, 1) * laneWidth.value)
const laneX = (lane: number): number => lane * laneWidth.value + laneWidth.value / 2

const listEl = ref<HTMLElement | null>(null)

// A fresh plot has its own lines, and the one being read may not be among them.
watch(() => props.views, () => { chosen.value = 0 }, { immediate: true })

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

// A row with nothing to add opens nothing, rather than an empty box.
function hasDetail(row: TimeRemainingRow): boolean {
  return Object.values(row.detail).some((value) => value !== undefined)
}

// The leg that brought the rider here, named by where it started. The time is
// the ride alone — the stop served on arrival is reported separately — and the
// station it started from is this row's parent, which the view already holds
// as a row of its own, so no resolver is needed to name it.
//
// It used to read "Ride in 15m", which said the opposite of what it meant:
// that the rider would arrive in fifteen minutes, rather than that fifteen
// minutes is what the leg they already rode had cost them.
const labels = computed(() => new Map(rows.value.map((row) => [row.key, row.label])))

function rideTerm(row: TimeRemainingRow): string {
  const from = row.parentKey === null ? undefined : labels.value.get(row.parentKey)
  return from ? `Rode in from ${from}` : 'Rode in'
}

// The element TooltipPanel measures off. Held here rather than inside it
// because a map hover has to name the row after scrolling it into view, and
// that measurement has to happen after the scroll, not against where the row
// started.
const anchor = ref<Element | null>(null)

function setAnchor(el?: Element | null): void {
  if (el) anchor.value = el
}

function activate(row: TimeRemainingRow, event: Event): void {
  setAnchor(event.currentTarget as Element | null)
  emit('activate', row.slug)
}

// Brings a row into view inside the list, and nowhere else.
//
// scrollIntoView, which this used to call, scrolls every scrollable ancestor
// the element has — including the page. Pointing at a station on the map
// therefore yanked the whole window down to wherever this card happened to
// sit, which is the one thing a rider reading the map is not asking for. The
// list's own scrollTop is the only thing that should move, so it is the only
// thing moved here.
function reveal(row: Element): void {
  const list = listEl.value
  if (!list) return
  const listRect = list.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top
  else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom
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
        reveal(row)
        // Measured after the scroll, so the box lands beside where the row
        // ended up rather than where it started.
        setAnchor(row)
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
        @mouseenter="activate(row, $event)"
        @mouseleave="emit('activate', null)"
        @focus="activate(row, $event)"
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
        </div>

        <p
          class="font-body text-caption shrink-0 py-1 text-right tabular-nums text-ink-true"
          data-testid="time-remaining-value"
        >
          {{ formatTimeRemaining(row.remainingSecs) }}
        </p>

        <!-- What the row's single number hides, shown beside the row rather
             than inside it. TooltipPanel hangs the box out of the list's
             flow and out of its scroller, so nothing moves or resizes while
             a pointer travels down the rows. It follows the pointer's row
             and is never pointed at itself, so it takes no hover of its own
             to keep it open — visibility is the row being active. -->
        <TooltipPanel
          v-if="isExpanded(row) && hasDetail(row)"
          :open="true"
          :anchor="anchor"
        >
          <dl
            class="font-body text-micro flex flex-col gap-0.5 text-ink-muted"
            data-testid="time-remaining-detail"
          >
            <!-- Read in the order the rider lives them: the leg in, what that
                 left them with, the stop served here, and the change made
                 before they leave again. The row's own number is the moment
                 they leave, so everything here happened before it. -->
            <div v-if="row.detail.accessTo">
              <dt class="inline">
                {{ row.flag }} to {{ row.detail.accessTo }}
              </dt>
              <dd class="ml-1 inline">
                {{ formatDuration(row.detail.accessSecs ?? 0) }}
              </dd>
            </div>
            <div v-if="row.detail.rideSecs !== undefined">
              <dt class="inline">
                {{ rideTerm(row) }}
              </dt>
              <dd class="ml-1 inline">
                {{ formatDuration(row.detail.rideSecs) }}
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
                Stopped here for
              </dt>
              <dd class="ml-1 inline">
                {{ formatDuration(row.detail.dwellSecs) }}
              </dd>
            </div>
            <div v-if="row.detail.transferFrom">
              <dt class="inline">
                Changed from
              </dt>
              <dd class="ml-1 inline">
                {{ row.detail.transferFrom }}
              </dd>
            </div>
          </dl>
        </TooltipPanel>
      </li>
    </ul>
  </section>
</template>
