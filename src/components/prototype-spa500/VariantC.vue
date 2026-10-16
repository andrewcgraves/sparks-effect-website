<script setup lang="ts">
// PROTOTYPE (SPA-500) variant C — "Outward from the starting point". After a
// plot the card is a tree: from each station boarded, one branch per line and
// direction, stations in line order going outward, a change of train nested at
// the station it happened. Every branch ends with the stations it didn't reach,
// so the card still lists the whole network. Before a plot each line is one
// branch from its first stop, both directions' run times on each hop.
import { computed } from 'vue'
import { TILE_CLASS, TILE_HEADING_CLASS } from '../tileStyles'
import { formatDuration, formatTimeRemaining, shortLineName } from '../timeRemaining'
import { modeLabel } from '../../copy/modes'
import CBranch from './CBranch.vue'
import type { CardData, CBranchData, CStop, Line, Plot } from './model'
import { hopSecs, hopState, linesAt, remainingAt } from './model'

const props = defineProps<{ data: CardData; loading?: boolean; activeSlug: string | null }>()
const emit = defineEmits<{ activate: [slug: string | null] }>()

function alsoOn(line: Line, slug: string): string | null {
  const others = linesAt(props.data.lines, slug).filter((l) => l.key !== line.key)
  return others.length ? `Also on ${others.map((l) => shortLineName(l.label)).join(', ')}` : null
}

function wholeLine(line: Line): CBranchData {
  const stops: CStop[] = line.stops.map((slug, i) => ({
    slug,
    name: props.data.name(slug),
    hopSecs: i ? line.hops[i - 1].secs : -1,
    reverseSecs: i ? line.hops[i - 1].reverseSecs : null,
    state: 'none',
    remaining: null,
    note: alsoOn(line, slug),
    branches: [],
  }))
  return { key: line.key, title: line.label, stops, tailFrom: stops.length }
}

interface Tree {
  roots: { slug: string; accessSecs: number; remaining: number; branches: CBranchData[] }[]
  walked: { slug: string; accessSecs: number; remaining: number }[]
  untouched: CBranchData[]
}

function buildTree(plot: Plot): Tree {
  const { lines, name } = props.data
  const started = new Set<string>()
  const touched = new Set<string>()

  function run(line: Line, from: string, dir: 1 | -1, path: Set<string>): CBranchData | null {
    const id = `${line.key}:${from}:${dir}`
    if (started.has(id)) return null
    const i = line.stops.indexOf(from)
    const stops: CStop[] = []
    let tailFrom = -1
    for (let j = i + dir; j >= 0 && j < line.stops.length; j += dir) {
      const slug = line.stops[j]
      const hop = line.hops[Math.min(j, j - dir)]
      const s = hopState(plot, hop, lines)
      const remaining = remainingAt(plot, slug)
      if (remaining === null && tailFrom < 0) tailFrom = stops.length
      const row = plot.rowBySlug.get(slug)
      stops.push({
        slug,
        name: name(slug),
        hopSecs: hopSecs(hop, dir > 0),
        reverseSecs: null,
        state: remaining !== null && s.state === 'ridden' ? 'ridden' : s.state === 'unfinished' ? 'unfinished' : 'unridden',
        fraction: s.fraction,
        remaining: tailFrom < 0 ? remaining : null,
        note: row?.detail.transferFrom ? `Changed from ${row.detail.transferFrom}` : null,
        branches: [],
      })
    }
    if (tailFrom < 0) tailFrom = stops.length
    if (tailFrom === 0 && stops[0]?.state !== 'unfinished') return null
    started.add(id)
    touched.add(line.key)
    const nextPath = new Set([...path, line.key])
    for (const stop of stops.slice(0, tailFrom)) stop.branches = branchesAt(stop.slug, nextPath)
    const terminus = line.stops[dir > 0 ? line.stops.length - 1 : 0]
    return { key: id, title: `${shortLineName(line.label)} toward ${name(terminus)}`, stops, tailFrom }
  }

  function branchesAt(slug: string, path: Set<string>): CBranchData[] {
    const out: CBranchData[] = []
    for (const line of linesAt(lines, slug)) {
      if (path.has(line.key)) continue
      for (const dir of [1, -1] as const) {
        const branch = run(line, slug, dir, path)
        if (branch) out.push(branch)
      }
    }
    return out
  }

  const boards = [...plot.boardSlugs]
    .map((slug) => ({
      slug,
      accessSecs: plot.bySlug.get(slug)!.access_secs ?? plot.bySlug.get(slug)!.access_mins * 60,
      remaining: remainingAt(plot, slug) ?? 0,
    }))
    .sort((a, b) => b.remaining - a.remaining)

  const roots = plot.walkOnly ? [] : boards
    .map((b) => ({ ...b, branches: branchesAt(b.slug, new Set()) }))
    .filter((r) => r.branches.length)
  const rootSlugs = new Set(roots.map((r) => r.slug))
  return {
    roots,
    walked: boards.filter((b) => !rootSlugs.has(b.slug)),
    untouched: lines.filter((l) => !touched.has(l.key)).map(wholeLine),
  }
}

const tree = computed(() => (props.data.plot ? buildTree(props.data.plot) : null))
</script>

<template>
  <section
    :class="TILE_CLASS"
    data-testid="prototype-stations-c"
  >
    <h2 :class="TILE_HEADING_CLASS">
      Stations
    </h2>

    <p
      v-if="props.loading"
      class="font-body text-caption mt-2 text-ink-muted italic"
    >
      Loading run times…
    </p>

    <template v-else-if="!tree">
      <CBranch
        v-for="line in props.data.lines"
        :key="line.key"
        :branch="wholeLine(line)"
        :active-slug="props.activeSlug"
        @activate="emit('activate', $event)"
      />
    </template>

    <div
      v-else
      class="mt-3 max-h-[36rem] overflow-y-auto"
    >
      <div class="font-body text-caption flex justify-between gap-3 border-b border-border pb-2 text-ink">
        <span><span class="mr-2 inline-block size-2.5 rounded-full bg-data-origin align-middle" />Starting point · {{ modeLabel(props.data.plot!.mode) }}</span>
        <span class="text-ink-true tabular-nums">{{ formatTimeRemaining(props.data.plot!.budgetSecs) }}</span>
      </div>

      <div
        v-for="root in tree.roots"
        :key="root.slug"
        class="mt-2"
      >
        <div
          class="font-body text-caption flex justify-between gap-3 rounded-(--radius-field) font-semibold text-ink"
          :class="props.activeSlug === root.slug ? 'bg-white' : ''"
          tabindex="0"
          @mouseenter="emit('activate', root.slug)"
          @mouseleave="emit('activate', null)"
        >
          <span>{{ props.data.name(root.slug) }} <span class="text-micro font-normal text-ink-muted">· boarded, {{ formatDuration(root.accessSecs) }} from starting point</span></span>
          <span class="tabular-nums">{{ formatTimeRemaining(root.remaining) }}</span>
        </div>
        <div class="ml-1">
          <CBranch
            v-for="branch in root.branches"
            :key="branch.key"
            :branch="branch"
            :active-slug="props.activeSlug"
            @activate="emit('activate', $event)"
          />
        </div>
      </div>

      <div
        v-if="tree.walked.length"
        class="mt-3"
      >
        <h3 class="font-display text-micro text-ink-muted uppercase">
          Reached without riding
        </h3>
        <ul class="list-none p-0">
          <li
            v-for="w in tree.walked"
            :key="w.slug"
            class="font-body text-caption flex justify-between gap-3 rounded-(--radius-field) text-ink"
            :class="props.activeSlug === w.slug ? 'bg-white' : ''"
            tabindex="0"
            @mouseenter="emit('activate', w.slug)"
            @mouseleave="emit('activate', null)"
          >
            <span>{{ props.data.name(w.slug) }} <span class="text-micro text-ink-muted">· {{ formatDuration(w.accessSecs) }}</span></span>
            <span class="text-ink-true tabular-nums">{{ formatTimeRemaining(w.remaining) }}</span>
          </li>
        </ul>
      </div>

      <details
        v-if="tree.untouched.length"
        class="group/cu mt-4 border-t border-border pt-2"
      >
        <summary class="font-body text-caption cursor-pointer list-none text-ink-muted [&::-webkit-details-marker]:hidden">
          <span class="inline-block w-2 transition-transform group-open/cu:rotate-90">›</span>
          Lines this trip didn't ride · {{ tree.untouched.length }}
        </summary>
        <CBranch
          v-for="branch in tree.untouched"
          :key="branch.key"
          :branch="branch"
          :active-slug="props.activeSlug"
          @activate="emit('activate', $event)"
        />
      </details>
    </div>
  </section>
</template>
