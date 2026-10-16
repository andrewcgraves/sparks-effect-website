<script setup lang="ts">
// PROTOTYPE (SPA-500) — one branch of variant C, recursive for changes of train.
import { formatRunTime } from '../stationTimes'
import { formatProgressPercent, formatTimeRemaining } from '../timeRemaining'
import type { CBranchData, CStop } from './model'

const props = defineProps<{ branch: CBranchData; activeSlug: string | null; depth?: number }>()
const emit = defineEmits<{ activate: [slug: string | null] }>()

function railClass(state: CStop['state']): string {
  if (state === 'ridden') return 'w-0.5 bg-ink'
  if (state === 'unfinished') return 'w-0 border-l-2 border-dashed border-ink'
  if (state === 'unridden') return 'w-px bg-ink-faint'
  return 'w-px bg-ink-muted'
}

function hopText(stop: CStop): string {
  const run = formatRunTime(stop.hopSecs)
  if (stop.state === 'unfinished') return `${formatProgressPercent(stop.fraction ?? 0)} of ${run}`
  if (stop.reverseSecs !== null && stop.reverseSecs !== stop.hopSecs) return `${run} (back ${formatRunTime(stop.reverseSecs)})`
  return run
}

const reached = (stops: CStop[]) => stops.slice(0, props.branch.tailFrom)
const tail = (stops: CStop[]) => stops.slice(props.branch.tailFrom)
// Only reached stops draw the rail on; the tail draws its own.
const next = (i: number): CStop | undefined => (i + 1 < props.branch.tailFrom ? props.branch.stops[i + 1] : undefined)
</script>

<template>
  <div
    class="mt-1"
    :class="(props.depth ?? 0) > 0 ? 'ml-4 border-l border-dashed border-ink-faint pl-3' : ''"
  >
    <h3 class="font-display text-micro mt-2 text-ink-muted uppercase">
      {{ props.branch.title }}
    </h3>
    <ol class="list-none p-0">
      <li
        v-for="(stop, i) in reached(props.branch.stops)"
        :key="stop.slug"
      >
        <div
          class="grid grid-cols-[0.75rem_1fr_auto] gap-x-3 rounded-(--radius-field)"
          :class="props.activeSlug === stop.slug ? 'bg-white' : ''"
          tabindex="0"
          @mouseenter="emit('activate', stop.slug)"
          @mouseleave="emit('activate', null)"
          @focus="emit('activate', stop.slug)"
          @blur="emit('activate', null)"
        >
          <!-- The hop sits above its station: you ride it to get here. -->
          <span class="relative">
            <span
              v-if="stop.hopSecs >= 0"
              class="absolute top-0 bottom-0 left-1/2 -translate-x-1/2"
              :class="railClass(stop.state)"
            />
          </span>
          <span class="font-body text-micro col-start-2 pt-0.5 text-ink-muted tabular-nums">{{ stop.hopSecs >= 0 ? `↓ ${hopText(stop)}` : '' }}</span>
          <span />
          <!-- Dot on the name's first line; below it, the start of the next hop. -->
          <span class="relative">
            <span
              v-if="stop.hopSecs >= 0"
              class="absolute top-0 h-[0.6rem] left-1/2 -translate-x-1/2"
              :class="railClass(stop.state)"
            />
            <span
              v-if="next(i)"
              class="absolute top-[0.6rem] bottom-0 left-1/2 -translate-x-1/2"
              :class="railClass(next(i)!.state)"
            />
            <span
              class="absolute top-[0.6rem] left-1/2 -translate-1/2 rounded-full"
              :class="stop.state === 'none' ? 'size-1.5 bg-ink-muted' : 'size-2 bg-ink'"
            />
          </span>
          <span class="font-body text-caption col-start-2 truncate text-ink">
            {{ stop.name }}
            <span
              v-if="stop.note"
              class="text-micro block text-ink-muted"
            >{{ stop.note }}</span>
          </span>
          <span class="font-body text-caption text-right text-ink-true tabular-nums">
            {{ stop.remaining === null ? '' : formatTimeRemaining(stop.remaining) }}
          </span>
        </div>
        <CBranch
          v-for="child in stop.branches"
          :key="child.key"
          :branch="child"
          :active-slug="props.activeSlug"
          :depth="(props.depth ?? 0) + 1"
          @activate="emit('activate', $event)"
        />
      </li>
    </ol>
    <div
      v-if="tail(props.branch.stops).length"
      class="font-body text-caption text-ink-muted"
    >
      <p
        v-if="tail(props.branch.stops)[0].state === 'unfinished'"
        class="flex items-center gap-2 pl-0.5"
      >
        <span class="h-4 border-l-2 border-dashed border-ink" />
        <span class="italic">Ran out {{ formatProgressPercent(tail(props.branch.stops)[0].fraction ?? 0) }} of the way to {{ tail(props.branch.stops)[0].name }}</span>
      </p>
      <details class="group/c">
        <summary class="text-micro cursor-pointer list-none pl-5 [&::-webkit-details-marker]:hidden">
          + {{ tail(props.branch.stops).length }} not reached ·
          {{ tail(props.branch.stops).map((s) => s.name).join(', ') }}
        </summary>
        <ol class="list-none pl-5">
          <li
            v-for="stop in tail(props.branch.stops)"
            :key="stop.slug"
            class="text-micro flex justify-between gap-3 opacity-70"
            @mouseenter="emit('activate', stop.slug)"
            @mouseleave="emit('activate', null)"
          >
            <span>{{ stop.name }}</span><span class="tabular-nums">{{ hopText(stop) }}</span>
          </li>
        </ol>
      </details>
    </div>
  </div>
</template>
