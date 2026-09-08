import type { ChainMetadata, JourneyLeg, ReachableStation, TripProgress } from '../fixtures/isochrone'

export const ORIGIN_KEY = 'origin'

export const GRAPH_COLUMN_PX = 96
export const MAX_LANE_PX = 20
export const MIN_LANE_PX = 10

export interface RowDetail {
  arrivalSecs?: number
  dwellSecs?: number
  rideSecs?: number
  transferFrom?: string
  accessSecs?: number
  accessTo?: string
  progressTo?: string
  progressFraction?: number
}

export interface TimeRemainingRow {
  key: string
  slug: string | null
  label: string
  remainingSecs: number
  flag: string | null
  parentKey: string | null
  detail: RowDetail
  lane: number
  through: number[]
  forks: number[]
  incoming: boolean
}

export const ACCESS_VIEW_KEY = 'access'

export interface TimeRemainingView {
  key: string
  label: string
  rows: TimeRemainingRow[]
  laneCount: number
}

export interface TimeRemainingGraph {
  views: TimeRemainingView[]
}

export interface TimeRemainingContext {
  stationName: (slug: string) => string
  serviceName: (id: string) => string
  line?: (serviceID: string) => { key: string; label: string }
  mode: string
}

const MODE_LABELS: Record<string, string> = {
  walk: 'Walk',
  bike: 'Bike',
  drive: 'Drive',
  transit: 'Transit',
}

export function formatTimeRemaining(totalSecs: number): string {
  const minutes = Math.max(0, Math.floor(totalSecs / 60))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

export function formatDuration(totalSecs: number): string {
  const secs = Math.max(0, Math.round(totalSecs))
  if (secs < 60) return `${secs}s`
  const minutes = Math.floor(secs / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function formatProgressPercent(fraction: number): string {
  const percent = Math.round(fraction * 100)
  return `${Math.min(99, Math.max(1, percent))}%`
}

export function shortLineName(name: string): string {
  const head = name.split(/\s+[—–-]\s+/)[0].trim()
  return head || name
}

export function laneWidthFor(laneCount: number): number {
  return Math.min(MAX_LANE_PX, Math.max(MIN_LANE_PX, Math.floor(GRAPH_COLUMN_PX / laneCount)))
}

function lastLeg(station: ReachableStation): JourneyLeg | null {
  const legs = station.legs ?? []
  return legs.length ? legs[legs.length - 1] : null
}

function remainingSecsOf(station: ReachableStation): number {
  return station.remaining_secs ?? station.remaining_mins * 60
}

function accessSecsOf(station: ReachableStation): number {
  return station.access_secs ?? station.access_mins * 60
}

function departWaitSecs(slug: string, children: ReachableStation[]): number {
  const boarded = children.find((child) => child.board_slug === slug)
  return boarded?.board_wait_secs ?? 0
}

function departureSecsOf(station: ReachableStation, children: ReachableStation[]): number {
  return remainingSecsOf(station) - departWaitSecs(station.station_slug, children)
}

export function buildTimeRemainingGraph(
  metadata: ChainMetadata | null,
  context: TimeRemainingContext,
): TimeRemainingGraph {
  if (!metadata || !metadata.reachable_stations.length) return { views: [] }

  const stations = metadata.reachable_stations
  const bySlug = new Map(stations.map((s) => [s.station_slug, s]))
  const childrenOf = new Map<string, ReachableStation[]>()

  const parentKeyOf = (station: ReachableStation): string => {
    const predecessor = station.predecessor_slug
    return predecessor && bySlug.has(predecessor) ? predecessor : ORIGIN_KEY
  }

  for (const station of stations) {
    const parent = parentKeyOf(station)
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), station])
  }

  const departure = new Map(
    stations.map((s) => [s.station_slug, departureSecsOf(s, childrenOf.get(s.station_slug) ?? [])]),
  )
  const byRemaining = (a: ReachableStation, b: ReachableStation): number => {
    const delta = (departure.get(b.station_slug) ?? 0) - (departure.get(a.station_slug) ?? 0)
    return delta !== 0 ? delta : a.station_slug.localeCompare(b.station_slug)
  }

  // Child lists share the row order, so the first branch off a station is the
  // one with the most time left after it — the branch drawn straight on.
  const ordered = [...stations].sort(byRemaining)
  for (const [parent, children] of childrenOf) childrenOf.set(parent, [...children].sort(byRemaining))

  // Row content is worked out once, from the whole trip. What a rider does at a
  // station — which service they leave on, what they waited, whether they
  // change — is a fact about the trip, not about the view it is being read in,
  // so a station carries the same answer in every view it appears in. Only
  // membership, parentage and lane geometry are per-view.
  const content = new Map(
    ordered.map((station) => [
      station.station_slug,
      buildStationRow(station, childrenOf.get(station.station_slug) ?? [], context),
    ]),
  )
  const originRow = buildOriginRow(metadata, childrenOf.get(ORIGIN_KEY) ?? [], context)

  const memberships = viewMemberships(ordered, bySlug, parentKeyOf, context)

  const trip: Trip = {
    originRow,
    content,
    arrivedOn: new Map(ordered.map((station) => [station.station_slug, lastLeg(station)?.service_id])),
    byRemaining: (a, b) => byRemaining(bySlug.get(a)!, bySlug.get(b)!),
    context,
    progress: progressByOrigin(metadata.trip_progress),
    viewKeys: new Set(memberships.map((m) => m.key)),
  }

  const views = memberships.map((membership) => buildView(membership, trip))
  return { views: views.filter((view) => view.rows.length > 1) }
}

function progressByOrigin(progress: TripProgress[] | undefined): Map<string, TripProgress[]> {
  const out = new Map<string, TripProgress[]>()
  for (const leg of progress ?? []) {
    out.set(leg.from, [...(out.get(leg.from) ?? []), leg])
  }
  return out
}

function progressFor(rowKey: string, viewKey: string, trip: Trip): TripProgress | undefined {
  let best: TripProgress | undefined
  for (const leg of trip.progress.get(rowKey) ?? []) {
    const home = lineKeyOf(leg, trip.context)
    if (home !== undefined && home !== viewKey && trip.viewKeys.has(home)) continue
    const furtherThanBest =
      !best || leg.fraction > best.fraction || (leg.fraction === best.fraction && leg.to < best.to)
    if (furtherThanBest) best = leg
  }
  return best
}

function lineKeyOf(leg: TripProgress, context: TimeRemainingContext): string | undefined {
  if (!leg.service_id) return undefined
  return context.line?.(leg.service_id).key ?? leg.service_id
}

interface Trip {
  originRow: TimeRemainingRow
  content: Map<string, TimeRemainingRow>
  arrivedOn: Map<string, string | undefined>
  byRemaining: (a: string, b: string) => number
  context: TimeRemainingContext
  progress: Map<string, TripProgress[]>
  viewKeys: Set<string>
}

interface ViewMembership {
  key: string
  label: string
  members: string[]
}

function viewMemberships(
  ordered: ReachableStation[],
  bySlug: Map<string, ReachableStation>,
  parentKeyOf: (station: ReachableStation) => string,
  context: TimeRemainingContext,
): ViewMembership[] {
  const lineOf = context.line ?? ((id: string) => ({ key: id, label: context.serviceName(id) }))
  const access: string[] = []
  const byLine = new Map<string, { label: string; members: string[] }>()

  for (const station of ordered) {
    const service = lastLeg(station)?.service_id
    if (service === undefined) {
      access.push(station.station_slug)
      continue
    }
    const { key, label } = lineOf(service)
    const line = byLine.get(key) ?? { label, members: [] }
    line.members.push(station.station_slug)
    byLine.set(key, line)
  }

  // The station a service is boarded at rides along with it, so its branches
  // have a root to hang from rather than floating off the starting location one
  // by one. It is the only row a view borrows, and it is never a destination
  // of that view.
  const withBoardingPoints = (members: string[]): string[] => {
    const held = new Set(members)
    const roots: string[] = []
    for (const slug of members) {
      const parent = parentKeyOf(bySlug.get(slug)!)
      if (parent !== ORIGIN_KEY && !held.has(parent) && !roots.includes(parent)) roots.push(parent)
    }
    return [...roots, ...members]
  }

  if (byLine.size === 0) {
    return [{ key: ACCESS_VIEW_KEY, label: MODE_LABELS[context.mode] ?? context.mode, members: access }]
  }
  return [...byLine].map(([key, { label, members }]) => ({
    key,
    label,
    members: withBoardingPoints(members),
  }))
}

function buildView({ key, label, members }: ViewMembership, trip: Trip): TimeRemainingView {
  const held = new Set(members)
  const rows = [
    { ...trip.originRow, lane: 0, through: [], forks: [] },
    ...[...members].sort(trip.byRemaining).map((slug) => {
      const row = trip.content.get(slug)!
      return {
        ...row,
        parentKey: row.parentKey && held.has(row.parentKey) ? row.parentKey : ORIGIN_KEY,
        detail: { ...row.detail },
        lane: 0,
        through: [],
        forks: [],
      }
    }),
  ]

  const childrenOf = new Map<string, string[]>()
  for (const row of rows.slice(1)) {
    const parent = row.parentKey ?? ORIGIN_KEY
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), row.key])
  }

  for (const row of rows.slice(1)) {
    const { flag, transferFrom } = departure(row.key, childrenOf.get(row.key) ?? [], trip)
    row.flag = flag
    if (transferFrom) row.detail.transferFrom = transferFrom

    const unfinished = progressFor(row.key, key, trip)
    if (unfinished) {
      row.detail.progressTo = trip.context.stationName(unfinished.to)
      row.detail.progressFraction = unfinished.fraction
    }
  }

  return { key, label, rows, laneCount: assignLanes(rows, childrenOf) }
}

function buildOriginRow(
  metadata: ChainMetadata,
  children: ReachableStation[],
  context: TimeRemainingContext,
): TimeRemainingRow {
  const first = children[0]
  return {
    key: ORIGIN_KEY,
    slug: null,
    label: 'Starting location',
    remainingSecs: metadata.origin_budget_mins * 60,
    flag: MODE_LABELS[context.mode] ?? context.mode,
    parentKey: null,
    detail: first
      ? { accessSecs: accessSecsOf(first), accessTo: context.stationName(first.station_slug) }
      : {},
    lane: 0,
    through: [],
    forks: [],
    incoming: false,
  }
}

function buildStationRow(
  station: ReachableStation,
  children: ReachableStation[],
  context: TimeRemainingContext,
): TimeRemainingRow {
  const arrival = lastLeg(station)
  const dwellSecs = arrival?.dwell_s ?? 0
  const waitSecs = departWaitSecs(station.station_slug, children)
  const remainingSecs = departureSecsOf(station, children)

  const detail: RowDetail = {}
  if (dwellSecs + waitSecs > 0) detail.arrivalSecs = remainingSecs + dwellSecs + waitSecs
  if (dwellSecs > 0) detail.dwellSecs = dwellSecs
  if (arrival) detail.rideSecs = arrival.secs - (arrival.dwell_s ?? 0)

  return {
    key: station.station_slug,
    slug: station.station_slug,
    label: context.stationName(station.station_slug),
    remainingSecs,
    // Settled per view, from the branches that leave this row inside it.
    flag: null,
    parentKey: station.predecessor_slug ?? ORIGIN_KEY,
    detail,
    lane: 0,
    through: [],
    forks: [],
    incoming: true,
  }
}

function departure(
  rowKey: string,
  childKeys: string[],
  trip: Trip,
): { flag: string | null; transferFrom?: string } {
  const arrived = trip.arrivedOn.get(rowKey)
  const onward = childKeys.map((key) => trip.arrivedOn.get(key))
  const staysAboard = arrived !== undefined && onward.includes(arrived)
  const departsOn = staysAboard ? arrived : onward[0]

  return {
    flag: departsOn ? trip.context.serviceName(departsOn) : null,
    transferFrom: arrived && onward.length && !staysAboard ? trip.context.serviceName(arrived) : undefined,
  }
}

function assignLanes(
  rows: TimeRemainingRow[],
  childrenOf: Map<string, string[]>,
): number {
  const reserved: (string | null)[] = []
  let laneCount = 0

  const takeFreeLane = (): number => {
    const free = reserved.indexOf(null)
    if (free !== -1) return free
    reserved.push(null)
    return reserved.length - 1
  }

  for (const row of rows) {
    let lane = reserved.indexOf(row.key)
    if (lane === -1) lane = takeFreeLane()

    row.lane = lane
    row.through = reserved
      .map((pending, index) => (pending !== null && index !== lane ? index : -1))
      .filter((index) => index >= 0)

    reserved[lane] = null
    row.forks = (childrenOf.get(row.key) ?? []).map((child, index) => {
      const childLane = index === 0 ? lane : takeFreeLane()
      reserved[childLane] = child
      return childLane
    })

    laneCount = Math.max(laneCount, reserved.length)
  }
  return laneCount
}
