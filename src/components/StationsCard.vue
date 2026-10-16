<script setup lang="ts">
import { TILE_CLASS, TILE_HEADING_CLASS } from './tileStyles'
import { computed, nextTick, ref, useId, watch } from 'vue'
import SegmentedControl from './SegmentedControl.vue'
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'
import TooltipPanel from './TooltipPanel.vue'
import StationDetail from './StationDetail.vue'
import { formatRunTime, formatTotalTime } from './stationTimes'
import { formatDuration, formatProgressPercent, formatTimeRemaining } from './timeRemaining'
import { modeLabel } from '../copy/modes'
import { hasReturnTimes, reachedCount, stationRows } from './stationsCard'
import type { HopRow, HopState, PlotReading, StationLine, StationRow } from './stationsCard'

const props = defineProps<{
  lines: StationLine[]
  name: (slug: string) => string
  plot: PlotReading | null
  loading?: boolean
  activeSlug: string | null
  activeFromMap?: boolean
}>()

const emit = defineEmits<{ activate: [slug: string | null] }>()

const headingId = useId()
const listEl = ref<HTMLElement | null>(null)
const reversed = ref<Record<string, boolean>>({})
const open = ref<Record<string, boolean>>({})

// A plot opens the lines it reached and closes the rest; with no plot the
// first line is open, as the timetable card always opened.
watch(
  () => [props.plot, props.lines] as const,
  ([plot, lines]) => {
    open.value = Object.fromEntries(
      lines.map((line, index) => [line.key, plot ? reachedCount(line, plot) > 0 : index === 0]),
    )
  },
  { immediate: true },
)

const rowsByLine = computed(
  () =>
    new Map(
      props.lines.map((line) => [
        line.key,
        stationRows(line, props.lines, props.name, props.plot, !!reversed.value[line.key]),
      ]),
    ),
)

function rowsOf(line: StationLine): StationRow[] {
  return rowsByLine.value.get(line.key) ?? []
}

function summary(line: StationLine): string {
  if (props.plot) return `${reachedCount(line, props.plot)} of ${line.stops.length} reached`
  const total = rowsOf(line).reduce((sum, row) => sum + (row.hop?.seconds ?? 0), 0)
  return `${line.stops.length} stops · ${formatTotalTime(total)}`
}

function terminusOption(line: StationLine, turned: number): string {
  return `To ${props.name(turned ? line.stops[0] : line.stops[line.stops.length - 1])}`
}

function hopText(hop: HopRow): string {
  const run = formatRunTime(hop.seconds)
  const arrow = hop.ridden === 'down' ? '↓ ' : hop.ridden === 'up' ? '↑ ' : ''
  if (hop.state === 'unfinished' && hop.fraction !== undefined) {
    return `${arrow}${formatProgressPercent(hop.fraction)} of ${run}`
  }
  return `${arrow}${run}`
}

// The rail is drawn the way the map draws a line under a plot: ridden in ink,
// unridden faint, unfinished dashed; with no plot, the timetable's quiet rule.
function railClass(state: HopState | undefined): string {
  switch (state) {
    case 'ridden':
      return 'w-0.5 bg-ink'
    case 'unfinished':
      return 'w-0 border-l-2 border-dashed border-ink'
    case 'unridden':
      return 'w-px bg-ink-faint'
    default:
      return 'w-px bg-border'
  }
}

function reached(row: StationRow): boolean {
  return row.remainingSecs !== null
}

function dotClass(row: StationRow): string {
  if (!props.plot) return 'size-1.5 bg-ink-muted'
  if (row.boardedAfterSecs !== null) return 'size-2.5 bg-data-origin ring-2 ring-surface'
  return reached(row) ? 'size-2 bg-ink' : 'size-1.5 border border-ink-muted bg-surface'
}

function notes(row: StationRow): string[] {
  const out: string[] = []
  if (row.boardedAfterSecs !== null) {
    const verb = props.plot?.rodeNothing ? 'Walked here' : 'Boarded here'
    // A starting point at the station needs no distance read back to it.
    out.push(
      row.boardedAfterSecs < 60
        ? verb
        : `${verb} · ${formatDuration(row.boardedAfterSecs)}${props.plot?.rodeNothing ? '' : ' from starting point'}`,
    )
  }
  if (row.changedFrom) out.push(`Changed from ${row.changedFrom}`)
  if (row.alsoOn.length) out.push(`Also on ${row.alsoOn.join(', ')}`)
  return out
}

function hasDetail(row: StationRow): boolean {
  return Object.values(row.detail).some((value) => value !== undefined)
}

// A station on two lines has a row in each; only the one pointed at opens.
const anchor = ref<Element | null>(null)
const anchorKey = ref<string | null>(null)

function rowKey(line: StationLine, row: StationRow): string {
  return `${line.key}:${row.slug}`
}

function activate(line: StationLine, row: StationRow, event: Event): void {
  anchor.value = event.currentTarget as Element | null
  anchorKey.value = rowKey(line, row)
  emit('activate', row.slug)
}

function deactivate(): void {
  anchorKey.value = null
  emit('activate', null)
}

function expanded(line: StationLine, row: StationRow): boolean {
  return (
    !!props.plot &&
    row.slug === props.activeSlug &&
    anchorKey.value === rowKey(line, row) &&
    reached(row) &&
    hasDetail(row)
  )
}

function reveal(row: Element): void {
  const list = listEl.value
  if (!list) return
  const listRect = list.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top
  else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom
}

// A station pointed at on the map opens its line and comes into view inside the
// card, never by scrolling the page under the pointer.
watch(
  () => [props.activeSlug, props.activeFromMap] as const,
  async ([slug, fromMap]) => {
    if (!slug || !fromMap) return
    const line = props.lines.find((l) => open.value[l.key] && l.stops.includes(slug))
      ?? props.lines.find((l) => l.stops.includes(slug))
    if (!line) return
    open.value = { ...open.value, [line.key]: true }
    await nextTick()
    // Matched in script rather than through a selector, because a slug is the
    // graph's own key and nothing promises it is safe to interpolate into one.
    for (const el of listEl.value?.querySelectorAll('[data-station-row]') ?? []) {
      if (el.getAttribute('data-station-row') === `${line.key}:${slug}`) {
        reveal(el)
        anchor.value = el
        anchorKey.value = `${line.key}:${slug}`
        return
      }
    }
  },
)

function onToggle(line: StationLine, event: Event): void {
  open.value = { ...open.value, [line.key]: (event.target as HTMLDetailsElement).open }
}
</script>

<template>
  <section
    :class="TILE_CLASS"
    :aria-labelledby="headingId"
    data-testid="stations"
  >
    <h2
      :id="headingId"
      :class="TILE_HEADING_CLASS"
    >
      Stations
    </h2>
    <p
      v-if="props.plot"
      class="font-body text-caption mt-1 text-ink-muted"
      data-testid="stations-plot-summary"
    >
      Starting point · {{ modeLabel(props.plot.mode) }} ·
      {{ formatTimeRemaining(props.plot.budgetSecs) }} travel time
    </p>

    <LoadingRegion
      v-if="props.loading"
      label="Loading run times"
      class="mt-3 flex flex-col gap-1"
      data-testid="station-times-loading"
    >
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
      v-else-if="!props.lines.length"
      class="font-body text-caption mt-2 text-ink-muted italic"
      data-testid="station-times-empty"
    >
      No run times yet.
    </p>

    <!-- The time-left column runs to the right edge, where the scrollbar draws:
         a stable gutter keeps a classic scrollbar off it, and the padding keeps
         an overlay one (macOS, GTK) from painting over the digits. -->
    <div
      v-else
      ref="listEl"
      class="mt-3 max-h-[36rem] divide-y divide-border overflow-y-auto border-t border-border pr-3 [scrollbar-gutter:stable]"
    >
      <details
        v-for="line in props.lines"
        :key="line.key"
        class="group/stations"
        :open="open[line.key]"
        data-testid="station-time-group"
        @toggle="onToggle(line, $event)"
      >
        <summary
          class="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 [&::-webkit-details-marker]:hidden"
        >
          <span
            aria-hidden="true"
            class="inline-block w-2 text-ink-muted transition-transform duration-200 group-open/stations:rotate-90"
          >›</span>
          <h3
            class="font-display text-btn min-w-0 flex-[1_1_12rem] text-ink-true uppercase"
            data-testid="station-time-group-label"
          >
            {{ line.label }}
          </h3>
          <span
            class="font-body text-caption ml-auto shrink-0 pl-5 text-ink-muted tabular-nums"
            data-testid="station-time-group-summary"
          >
            {{ summary(line) }}
          </span>
        </summary>

        <div class="pb-3 pl-5">
          <SegmentedControl
            v-if="!props.plot && hasReturnTimes(line)"
            :model-value="reversed[line.key] ? 1 : 0"
            :options="[0, 1]"
            :format-option="(turned: number) => terminusOption(line, turned)"
            label="Direction"
            :name="`station-times-direction-${line.key}`"
            testid="direction-toggle"
            @update:model-value="(turned: number) => (reversed = { ...reversed, [line.key]: turned === 1 })"
          />

          <div
            v-if="props.plot"
            aria-hidden="true"
            class="font-body text-micro mt-1 flex gap-3 text-ink-muted uppercase"
          >
            <span class="flex-1" />
            <span>Run</span>
            <span class="w-14 text-right">Left</span>
          </div>

          <ol
            class="mt-1 flex list-none flex-col p-0"
            data-testid="station-time-stops"
          >
            <template
              v-for="(row, index) in rowsOf(line)"
              :key="row.slug"
            >
              <li
                class="flex items-stretch gap-3 rounded-(--radius-field) focus-visible:-outline-offset-(--focus-ring-width)"
                :class="[
                  props.activeSlug === row.slug ? 'bg-white' : '',
                  props.plot && !reached(row) ? 'opacity-60' : '',
                ]"
                :tabindex="props.plot ? 0 : undefined"
                :data-station-row="rowKey(line, row)"
                data-testid="station-time-stop"
                @mouseenter="activate(line, row, $event)"
                @mouseleave="deactivate"
                @focus="activate(line, row, $event)"
                @blur="deactivate"
              >
                <span
                  aria-hidden="true"
                  class="relative w-3 shrink-0"
                >
                  <span
                    v-if="index > 0"
                    class="absolute top-0 left-1/2 h-[0.9rem] -translate-x-1/2"
                    :class="railClass(rowsOf(line)[index - 1].hop?.state)"
                  />
                  <span
                    v-if="row.hop"
                    class="absolute top-[0.9rem] bottom-0 left-1/2 -translate-x-1/2"
                    :class="railClass(row.hop.state)"
                  />
                  <span
                    class="absolute top-[0.9rem] left-1/2 -translate-1/2 rounded-full"
                    :class="dotClass(row)"
                  />
                </span>
                <span class="min-w-0 flex-1 py-1">
                  <span
                    class="font-body text-caption block truncate text-ink"
                    data-testid="station-time-stop-name"
                  >{{ row.name }}</span>
                  <span
                    v-for="note in notes(row)"
                    :key="note"
                    class="font-body text-micro block text-ink-muted"
                    data-testid="station-time-stop-note"
                  >{{ note }}</span>
                </span>
                <span
                  v-if="props.plot"
                  class="font-body text-caption w-14 shrink-0 py-1 text-right text-ink-true tabular-nums"
                  data-testid="station-time-left"
                >
                  <span class="sr-only">time left </span>{{ reached(row) ? formatTimeRemaining(row.remainingSecs!) : '—' }}
                </span>

                <TooltipPanel
                  v-if="expanded(line, row)"
                  :open="true"
                  :anchor="anchor"
                >
                  <StationDetail
                    :detail="row.detail"
                    :rode-in-from="row.rodeInFrom"
                  />
                </TooltipPanel>
              </li>
              <!-- The run time between two stops sits on a row of its own
                   between them, so a stop's notes never push it out of line. -->
              <li
                v-if="row.hop"
                class="flex items-stretch gap-3"
              >
                <span
                  aria-hidden="true"
                  class="relative w-3 shrink-0"
                >
                  <span
                    class="absolute top-0 bottom-0 left-1/2 -translate-x-1/2"
                    :class="railClass(row.hop.state)"
                  />
                </span>
                <span
                  class="font-body text-micro flex-1 text-right text-ink-muted tabular-nums"
                  data-testid="station-time-hop"
                >
                  <span class="sr-only">to {{ rowsOf(line)[index + 1].name }}, run time </span>{{ hopText(row.hop) }}
                </span>
                <span
                  v-if="props.plot"
                  class="w-14 shrink-0"
                />
              </li>
            </template>
          </ol>
        </div>
      </details>
    </div>
  </section>
</template>
