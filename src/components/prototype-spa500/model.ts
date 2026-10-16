// PROTOTYPE (SPA-500) — throwaway. Not production code; lives on a spike branch
// only. Joins the network's line-order segments to a plot's reachable stations
// so one card can show both "Time between stations" and "Time remaining".
import type { Route, SegmentTime, Station } from '../../api/scenarios'
import type { ChainMetadata, ReachableStation, TripProgress } from '../../fixtures/isochrone'
import type { TimeRemainingRow, TimeRemainingView } from '../timeRemaining'
import { remainingSecsOf } from '../timeRemaining'

export interface Hop {
  from: string
  to: string
  secs: number
  reverseSecs: number
}

export interface Line {
  key: string
  label: string
  stops: string[]
  hops: Hop[]
}

export type HopState = 'ridden' | 'unfinished' | 'unridden'

export interface Plot {
  bySlug: Map<string, ReachableStation>
  rowBySlug: Map<string, TimeRemainingRow>
  boardSlugs: Set<string>
  progress: TripProgress[]
  walkOnly: boolean
  budgetSecs: number
  mode: string
}

export interface CardData {
  lines: Line[]
  name: (slug: string) => string
  plot: Plot | null
}

export function buildLines(segments: SegmentTime[], routes: Route[]): Line[] {
  const byRoute = new Map<string, SegmentTime[]>()
  for (const s of segments) {
    const key = s.route_id ?? 'seeded'
    byRoute.set(key, [...(byRoute.get(key) ?? []), s])
  }
  return [...byRoute].map(([key, hops]) => ({
    key,
    label: routes.find((r) => r.id === key)?.name ?? `${hops[0].from} – ${hops[hops.length - 1].to}`,
    stops: [hops[0].from, ...hops.map((h) => h.to)],
    hops: hops.map((h) => ({
      from: h.from,
      to: h.to,
      secs: h.run_seconds,
      reverseSecs: h.reverse_run_seconds ?? h.run_seconds,
    })),
  }))
}

export function buildPlot(metadata: ChainMetadata | null, views: TimeRemainingView[]): Plot | null {
  if (!metadata || !metadata.reachable_stations.length) return null
  const bySlug = new Map(metadata.reachable_stations.map((s) => [s.station_slug, s]))
  const rowBySlug = new Map<string, TimeRemainingRow>()
  for (const view of views) for (const row of view.rows) if (row.slug) rowBySlug.set(row.slug, row)
  const boardSlugs = new Set(
    metadata.reachable_stations.filter((s) => !(s.legs ?? []).length).map((s) => s.station_slug),
  )
  return {
    bySlug,
    rowBySlug,
    boardSlugs,
    progress: metadata.trip_progress ?? [],
    walkOnly: metadata.reachable_stations.every((s) => !(s.legs ?? []).length),
    budgetSecs: metadata.origin_budget_mins * 60,
    mode: metadata.mode,
  }
}

export function remainingAt(plot: Plot, slug: string): number | null {
  const row = plot.rowBySlug.get(slug)
  if (row) return row.remainingSecs
  const station = plot.bySlug.get(slug)
  return station ? remainingSecsOf(station) : null
}

// A hop was ridden when one end's journey arrived from the other on it.
export function hopState(plot: Plot, hop: Hop, lines: Line[]): { state: HopState; forward: boolean; fraction?: number } {
  const to = plot.bySlug.get(hop.to)
  const from = plot.bySlug.get(hop.from)
  if (to && rodeBetween(to, hop.from)) return { state: 'ridden', forward: true }
  if (from && rodeBetween(from, hop.to)) return { state: 'ridden', forward: false }
  // An express can skip a stop, so a hop is also ridden when a leg passes over it.
  const passed = passedOver(plot, hop, lines)
  if (passed !== null) return { state: 'ridden', forward: passed }
  const fwd = plot.progress.find((p) => p.from === hop.from && p.to === hop.to)
  if (fwd) return { state: 'unfinished', forward: true, fraction: fwd.fraction }
  const back = plot.progress.find((p) => p.from === hop.to && p.to === hop.from)
  if (back) return { state: 'unfinished', forward: false, fraction: back.fraction }
  return { state: 'unridden', forward: true }
}

function rodeBetween(station: ReachableStation, other: string): boolean {
  const legs = station.legs ?? []
  return legs.length > 0 && legs[legs.length - 1].from === other
}

function passedOver(plot: Plot, hop: Hop, lines: Line[]): boolean | null {
  for (const station of plot.bySlug.values()) {
    for (const leg of station.legs ?? []) {
      for (const line of lines) {
        const a = line.stops.indexOf(leg.from)
        const b = line.stops.indexOf(leg.to)
        const i = line.stops.indexOf(hop.from)
        const j = line.stops.indexOf(hop.to)
        if (a < 0 || b < 0 || i < 0 || j < 0) continue
        if (a < b && a <= i && j <= b) return true
        if (b < a && b <= i && j <= a) return false
      }
    }
  }
  return null
}

export function hopSecs(hop: Hop, forward: boolean): number {
  return forward ? hop.secs : hop.reverseSecs
}

export function linesAt(lines: Line[], slug: string): Line[] {
  return lines.filter((l) => l.stops.includes(slug))
}

export function stationNamer(stations: Station[]): (slug: string) => string {
  const names = new Map(stations.map((s) => [s.slug, s.name]))
  return (slug) => names.get(slug) ?? slug
}

export function reachedCount(plot: Plot, line: Line): number {
  return line.stops.filter((s) => plot.bySlug.has(s)).length
}

export interface CStop {
  slug: string
  name: string
  hopSecs: number
  reverseSecs: number | null
  state: 'ridden' | 'unfinished' | 'unridden' | 'none'
  fraction?: number
  remaining: number | null
  note: string | null
  branches: CBranchData[]
}

export interface CBranchData {
  key: string
  title: string
  stops: CStop[]
  tailFrom: number
}
