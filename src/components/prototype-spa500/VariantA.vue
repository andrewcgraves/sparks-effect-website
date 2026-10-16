<script setup lang="ts">
// PROTOTYPE (SPA-500) variant A — "Line order". Time between stations as it is
// today; a plot adds a time-remaining column and colours the rail the way the
// map colours lines (ridden ink, unridden faint, unfinished dashed).
import { ref } from 'vue'
import { TILE_CLASS, TILE_HEADING_CLASS } from '../tileStyles'
import SegmentedControl from '../SegmentedControl.vue'
import { formatRunTime, formatTotalTime } from '../stationTimes'
import { formatDuration, formatProgressPercent, formatTimeRemaining, shortLineName } from '../timeRemaining'
import { modeLabel } from '../../copy/modes'
import type { CardData, Hop, Line } from './model'
import { hopSecs, hopState, linesAt, reachedCount, remainingAt } from './model'

const props = defineProps<{ data: CardData; loading?: boolean; activeSlug: string | null }>()
const emit = defineEmits<{ activate: [slug: string | null] }>()

const reversed = ref<Record<string, boolean>>({})

function asymmetric(line: Line): boolean {
  return line.hops.some((h) => h.secs !== h.reverseSecs)
}

// Before a plot the reader picks a direction; after one, the line reads in line
// order and each hop shows the time in the direction it was ridden.
function isReversed(line: Line): boolean {
  return !props.data.plot && !!reversed.value[line.key]
}

function stopsOf(line: Line): string[] {
  return isReversed(line) ? [...line.stops].reverse() : line.stops
}

function hopsOf(line: Line): { hop: Hop; forward: boolean }[] {
  return isReversed(line)
    ? [...line.hops].reverse().map((hop) => ({ hop, forward: false }))
    : line.hops.map((hop) => ({ hop, forward: true }))
}

function summary(line: Line): string {
  const plot = props.data.plot
  if (plot) return `${reachedCount(plot, line)} of ${line.stops.length} reached`
  const secs = hopsOf(line).reduce((sum, { hop, forward }) => sum + hopSecs(hop, forward), 0)
  return `${line.stops.length} stops · ${formatTotalTime(secs)}`
}

function hopInfo(line: Line, index: number) {
  const { hop, forward } = hopsOf(line)[index]
  const plot = props.data.plot
  if (!plot) return { state: 'none' as const, text: formatRunTime(hopSecs(hop, forward)), arrow: '' }
  const s = hopState(plot, hop, props.data.lines)
  const time = formatRunTime(hopSecs(hop, s.forward))
  const arrow = s.state === 'unridden' ? '' : s.forward ? '↓' : '↑'
  const text = s.state === 'unfinished' ? `${formatProgressPercent(s.fraction ?? 0)} of ${time}` : time
  return { state: s.state, text, arrow }
}

function railClass(state: string): string {
  if (state === 'ridden') return 'w-0.5 bg-ink'
  if (state === 'unfinished') return 'w-0 border-l-2 border-dashed border-ink'
  if (state === 'unridden') return 'w-px bg-ink-faint'
  return 'w-px bg-border'
}

function notes(line: Line, slug: string): string[] {
  const out: string[] = []
  const plot = props.data.plot
  if (plot?.boardSlugs.has(slug)) {
    const station = plot.bySlug.get(slug)!
    out.push(plot.walkOnly ? `Walked here, ${formatDuration(station.access_secs ?? 0)}` : `Boarded here · ${formatDuration(station.access_secs ?? 0)} from starting point`)
  }
  const changed = plot?.rowBySlug.get(slug)?.detail.transferFrom
  if (changed) out.push(`Changed from ${changed}`)
  const others = linesAt(props.data.lines, slug).filter((l) => l.key !== line.key)
  if (others.length) out.push(`Also on ${others.map((l) => shortLineName(l.label)).join(', ')}`)
  return out
}

function remaining(slug: string): string {
  const plot = props.data.plot
  const secs = plot ? remainingAt(plot, slug) : null
  return secs === null ? '—' : formatTimeRemaining(secs)
}

function open(line: Line, index: number): boolean {
  const plot = props.data.plot
  return plot ? reachedCount(plot, line) > 0 : index === 0
}
</script>

<template>
  <section
    :class="TILE_CLASS"
    data-testid="prototype-stations-a"
  >
    <h2 :class="TILE_HEADING_CLASS">
      Stations
    </h2>
    <p
      v-if="props.data.plot"
      class="font-body text-caption mt-1 text-ink-muted"
    >
      Starting point · {{ modeLabel(props.data.plot.mode) }} ·
      {{ formatTimeRemaining(props.data.plot.budgetSecs) }} of travel time. Right column is time left on arrival.
    </p>

    <p
      v-if="props.loading"
      class="font-body text-caption mt-2 text-ink-muted italic"
    >
      Loading run times…
    </p>

    <div
      v-else
      class="mt-3 divide-y divide-border border-t border-border"
    >
      <details
        v-for="(line, lineIndex) in props.data.lines"
        :key="`${line.key}-${!!props.data.plot}`"
        class="group/a"
        :open="open(line, lineIndex)"
      >
        <summary class="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span class="inline-block w-2 text-ink-muted transition-transform group-open/a:rotate-90">›</span>
          <h3 class="font-display text-btn min-w-0 flex-[1_1_12rem] text-ink-true uppercase">
            {{ line.label }}
          </h3>
          <span class="font-body text-caption ml-auto shrink-0 pl-5 text-ink-muted tabular-nums">{{ summary(line) }}</span>
        </summary>

        <div class="pb-3 pl-5">
          <SegmentedControl
            v-if="!props.data.plot && asymmetric(line)"
            :model-value="reversed[line.key] ? 1 : 0"
            :options="[0, 1]"
            :format-option="(i: number) => `To ${props.data.name(i ? line.stops[0] : line.stops[line.stops.length - 1])}`"
            label="Direction"
            :name="`a-direction-${line.key}`"
            @update:model-value="(i: number) => (reversed = { ...reversed, [line.key]: i === 1 })"
          />
          <div
            v-if="props.data.plot"
            class="font-body text-micro grid grid-cols-[1fr_auto_auto] gap-x-3 text-ink-muted uppercase"
          >
            <span />
            <span>Run</span>
            <span class="w-14 text-right">Left</span>
          </div>
          <ol class="mt-1 flex list-none flex-col p-0">
            <li
              v-for="(slug, index) in stopsOf(line)"
              :key="slug"
              class="flex items-stretch gap-3 rounded-(--radius-field)"
              :class="[
                props.activeSlug === slug ? 'bg-white' : '',
                props.data.plot && remainingAt(props.data.plot, slug) === null ? 'opacity-55' : '',
              ]"
              tabindex="0"
              @mouseenter="emit('activate', slug)"
              @mouseleave="emit('activate', null)"
              @focus="emit('activate', slug)"
              @blur="emit('activate', null)"
            >
              <span
                aria-hidden="true"
                class="relative w-3 shrink-0"
              >
                <span
                  v-if="index > 0"
                  class="absolute top-0 left-1/2 h-1/2 -translate-x-1/2"
                  :class="railClass(hopInfo(line, index - 1).state)"
                />
                <span
                  v-if="index < line.hops.length"
                  class="absolute top-1/2 bottom-0 left-1/2 -translate-x-1/2"
                  :class="railClass(hopInfo(line, index).state)"
                />
                <span
                  class="absolute top-1/2 left-1/2 -translate-1/2 rounded-full"
                  :class="props.data.plot?.boardSlugs.has(slug) ? 'size-2.5 bg-data-origin ring-2 ring-white' : !props.data.plot ? 'size-1.5 bg-ink-muted' : remainingAt(props.data.plot, slug) !== null ? 'size-2 bg-ink' : 'size-1.5 border border-ink-muted bg-surface'"
                />
              </span>
              <span class="min-w-0 flex-1 py-1">
                <span class="font-body text-caption block truncate text-ink">{{ props.data.name(slug) }}</span>
                <span
                  v-for="note in notes(line, slug)"
                  :key="note"
                  class="font-body text-micro block text-ink-muted"
                >{{ note }}</span>
              </span>
              <span
                v-if="index < line.hops.length"
                class="font-body text-caption shrink-0 translate-y-1/2 py-1 text-right text-ink-muted tabular-nums"
              >{{ hopInfo(line, index).arrow }} {{ hopInfo(line, index).text }}</span>
              <span
                v-else
                class="shrink-0"
              />
              <span
                v-if="props.data.plot"
                class="font-body text-caption w-14 shrink-0 py-1 text-right text-ink-true tabular-nums"
              >{{ remaining(slug) }}</span>
            </li>
          </ol>
        </div>
      </details>
    </div>
  </section>
</template>
