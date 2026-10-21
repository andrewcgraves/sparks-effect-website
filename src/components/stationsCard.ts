import type { Route, SegmentTime, Station } from '../api/scenarios'
import type { ChainMetadata, JourneyLeg, ReachableStation, TripProgress } from '../fixtures/isochrone'
import { UNNAMED_STATION } from '../copy/names'
import type { RowDetail, TimeRemainingGraph } from './timeRemaining'
import { remainingSecsBySlug, remainingSecsOf, shortLineName } from './timeRemaining'

export interface StationHop {
  from: string
  to: string
  seconds: number
  reverseSeconds: number
}

export interface StationLine {
  key: string
  label: string
  stops: string[]
  hops: StationHop[]
}

export interface PlotReading {
  mode: string
  budgetSecs: number
  rodeNothing: boolean
  reached: Map<string, ReachableStation>
  remainingSecs: (slug: string) => number | null
  detail: Map<string, RowDetail>
  progress: TripProgress[]
}

export type HopState = 'timetable' | 'ridden' | 'unridden' | 'unfinished'

export interface HopRow {
  seconds: number
  state: HopState
  // Down the list is line order; null where the hop was not ridden.
  ridden: 'down' | 'up' | null
  fraction?: number
}

export interface StationRow {
  slug: string
  name: string
  remainingSecs: number | null
  boardedAfterSecs: number | null
  changedFrom: string | null
  rodeInFrom: string | null
  alsoOn: string[]
  detail: RowDetail
  hop: HopRow | null
}

export function stationNames(stations: Station[]): (slug: string) => string {
  const names = new Map(stations.map((s) => [s.slug, s.name]))
  return (slug) => names.get(slug) ?? UNNAMED_STATION
}

// One line per route, in the order the routes first appear, so the card reads
// in the order the API served it. Segments from an API that reports no
// route_id all land in one line, the pre-SPA-245 behaviour.
export function stationLines(
  segments: SegmentTime[],
  routes: Route[],
  name: (slug: string) => string,
): StationLine[] {
  const byRoute = new Map<string | undefined, SegmentTime[]>()
  for (const segment of segments) {
    const hops = byRoute.get(segment.route_id)
    if (hops) hops.push(segment)
    else byRoute.set(segment.route_id, [segment])
  }
  return Array.from(byRoute, ([routeId, hops]) => {
    const stops = [hops[0].from, ...hops.map((hop) => hop.to)]
    return {
      key: routeId ?? 'seeded',
      label:
        (routeId ? routes.find((r) => r.id === routeId)?.name : undefined) ??
        `${name(stops[0])} – ${name(stops[stops.length - 1])}`,
      stops,
      hops: hops.map((hop) => ({
        from: hop.from,
        to: hop.to,
        seconds: hop.run_seconds,
        reverseSeconds: hop.reverse_run_seconds ?? hop.run_seconds,
      })),
    }
  })
}

export function hasReturnTimes(line: StationLine): boolean {
  return line.hops.some((hop) => hop.seconds !== hop.reverseSeconds)
}

export function readPlot(metadata: ChainMetadata | null, graph: TimeRemainingGraph): PlotReading | null {
  if (!metadata || !metadata.reachable_stations.length) return null
  const reached = new Map(metadata.reachable_stations.map((s) => [s.station_slug, s]))
  const fromGraph = remainingSecsBySlug(graph)
  const detail = new Map<string, RowDetail>()
  // A view settles a change of train only where the onward line is in it, so a
  // station's detail is gathered from every view it appears in.
  for (const view of graph.views) {
    for (const row of view.rows) {
      if (row.slug === null) continue
      const known = Object.fromEntries(Object.entries(row.detail).filter(([, value]) => value !== undefined))
      detail.set(row.slug, { ...detail.get(row.slug), ...known })
    }
  }
  return {
    mode: metadata.mode,
    budgetSecs: metadata.origin_budget_mins * 60,
    rodeNothing: metadata.reachable_stations.every((s) => !(s.legs ?? []).length),
    reached,
    // The graph's number first, so the card and the map agree on a station.
    remainingSecs: (slug) => {
      const station = reached.get(slug)
      if (!station) return null
      return fromGraph(slug) ?? remainingSecsOf(station)
    },
    detail,
    progress: metadata.trip_progress ?? [],
  }
}

// The direction a leg or progress covers the hop at index i of a line, if it
// does: an express skips stops, so one leg can cover several hops.
function covers(line: StationLine, from: string, to: string, i: number): 'down' | 'up' | null {
  const a = line.stops.indexOf(from)
  const b = line.stops.indexOf(to)
  if (a < 0 || b < 0) return null
  if (a <= i && i + 1 <= b) return 'down'
  if (b <= i && i + 1 <= a) return 'up'
  return null
}

function legs(plot: PlotReading): JourneyLeg[] {
  return [...plot.reached.values()].flatMap((station) => station.legs ?? [])
}

function hopRow(line: StationLine, i: number, plot: PlotReading | null, reversed: boolean): HopRow {
  const hop = line.hops[i]
  if (!plot) return { seconds: reversed ? hop.reverseSeconds : hop.seconds, state: 'timetable', ridden: null }
  for (const leg of legs(plot)) {
    const ridden = covers(line, leg.from, leg.to, i)
    if (ridden) return { seconds: ridden === 'down' ? hop.seconds : hop.reverseSeconds, state: 'ridden', ridden }
  }
  for (const leg of plot.progress) {
    const ridden = covers(line, leg.from, leg.to, i)
    if (!ridden) continue
    const adjacent = Math.abs(line.stops.indexOf(leg.from) - line.stops.indexOf(leg.to)) === 1
    return {
      seconds: ridden === 'down' ? hop.seconds : hop.reverseSeconds,
      state: 'unfinished',
      ridden,
      ...(adjacent ? { fraction: leg.fraction } : {}),
    }
  }
  return { seconds: hop.seconds, state: 'unridden', ridden: null }
}

export function stationRows(
  line: StationLine,
  lines: StationLine[],
  name: (slug: string) => string,
  plot: PlotReading | null,
  reversed = false,
): StationRow[] {
  // A plot reads in line order; only the timetable can be turned around.
  const turned = reversed && !plot
  const order = line.stops.map((_, i) => i)
  if (turned) order.reverse()

  return order.map((stopIndex, position) => {
    const slug = line.stops[stopIndex]
    const station = plot?.reached.get(slug)
    const lastLeg = station?.legs?.length ? station.legs[station.legs.length - 1] : undefined
    const detail = plot?.detail.get(slug) ?? {}
    const next = order[position + 1]
    return {
      slug,
      name: name(slug),
      remainingSecs: plot ? plot.remainingSecs(slug) : null,
      boardedAfterSecs:
        station && !lastLeg ? (station.access_secs ?? station.access_mins * 60) : null,
      changedFrom: detail.transferFrom ?? null,
      rodeInFrom: lastLeg ? name(lastLeg.from) : null,
      alsoOn: lines
        .filter((other) => other.key !== line.key && other.stops.includes(slug))
        .map((other) => shortLineName(other.label)),
      detail,
      hop: next === undefined ? null : hopRow(line, Math.min(stopIndex, next), plot, turned),
    }
  })
}

export function reachedCount(line: StationLine, plot: PlotReading): number {
  return line.stops.filter((slug) => plot.reached.has(slug)).length
}
