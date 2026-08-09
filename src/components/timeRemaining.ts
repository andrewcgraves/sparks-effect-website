import type { ChainMetadata, JourneyLeg, ReachableStation } from '../fixtures/isochrone'

/**
 * The trip a plotted isochrone describes, as a branching graph of rows.
 *
 * Everything here is a pure function of one chain response, so the shape of the
 * tree, the order of the rows and the geometry of the connectors can be stated
 * and checked without mounting anything — the same split the station-times
 * module beside this one already uses.
 */

// The row key of the starting location, which is a place the rider picked
// rather than a station and so has no slug of its own.
export const ORIGIN_KEY = 'origin'

// The connector column's preferred width, and the widest and narrowest a lane
// may be inside it. Lanes narrow as they multiply so that station names keep
// their room; past the floor the column scrolls sideways instead, which is the
// only thing that stops a deeply branching graph from squeezing the names out.
export const GRAPH_COLUMN_PX = 96
export const MAX_LANE_PX = 20
export const MIN_LANE_PX = 10

export interface RowDetail {
  // Time remaining at the moment the rider arrived, shown only when it differs
  // from the moment they leave — the difference being the dwell served here
  // plus any boarding wait paid here.
  arrivalSecs?: number
  dwellSecs?: number
  rideSecs?: number
  // The service arrived on, named only where it differs from the one departed
  // on, which is what makes this row a change of service.
  transferFrom?: string
  // The starting location's own detail: the access leg out of it, and the
  // station it leads to.
  accessSecs?: number
  accessTo?: string
}

export interface TimeRemainingRow {
  key: string
  // Null on the starting location, which is a point rather than a station.
  slug: string | null
  label: string
  // Time left at the moment the rider leaves this row. The wire reports the
  // moment they arrive, so any wait paid here has already been taken off.
  remainingSecs: number
  // What the rider leaves on: the travel mode at the starting location, the
  // service boarded at a station. Null where the journey ends, and that absence
  // is the thing that says so.
  flag: string | null
  parentKey: string | null
  detail: RowDetail
  // Where this row's node sits, which lanes pass it by without stopping, and
  // which lanes it forks down into. A fork onto its own lane is the branch
  // carrying straight on.
  lane: number
  through: number[]
  forks: number[]
  // Whether a connector arrives at this row from above. False only for the
  // starting location, which nothing leads to.
  incoming: boolean
}

export interface TimeRemainingGraph {
  rows: TimeRemainingRow[]
  laneCount: number
}

// What the graph needs from the page to render a wire payload as words: the
// two resolvers that turn ids into names, and the travel mode the trip was
// plotted for, which is how the rider leaves the starting location.
export interface TimeRemainingContext {
  stationName: (slug: string) => string
  serviceName: (id: string) => string
  mode: string
}

const MODE_LABELS: Record<string, string> = {
  walk: 'Walk',
  bike: 'Bike',
  drive: 'Drive',
}

/**
 * Time remaining as hours and minutes, with the hours dropped below an hour.
 *
 * Not the run-time formatter the neighbouring card uses: that one is minutes
 * and seconds, which reads as a wildly wrong number at the hour scale these
 * budgets run to.
 */
export function formatTimeRemaining(totalSecs: number): string {
  const minutes = Math.max(0, Math.floor(totalSecs / 60))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

/**
 * A span of time inside a trip — a dwell, a ride, an access leg — rather than
 * what is left of the budget.
 *
 * It keeps the seconds below a minute, because the things it describes are
 * routinely shorter than one: a dwell of forty-five seconds reported as "0m"
 * would read as no dwell at all.
 */
export function formatDuration(totalSecs: number): string {
  const secs = Math.max(0, Math.round(totalSecs))
  if (secs < 60) return `${secs}s`
  const minutes = Math.floor(secs / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/**
 * How wide one lane may be, given how many the graph needs.
 *
 * Lanes share the column until sharing would make them illegible, and then stop
 * shrinking. Past that the total outgrows the column, which is the caller's cue
 * to scroll the graph rather than the row.
 */
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

// The wait the rider pays to leave this station, which is charged once for a
// whole journey and so belongs to the station the child boarded at. A station
// none of its children boarded at costs nothing to leave.
function departWaitSecs(slug: string, children: ReachableStation[]): number {
  const boarded = children.find((child) => child.board_slug === slug)
  return boarded?.board_wait_secs ?? 0
}

// Time left at the moment the rider leaves. The wire reports the moment they
// arrive, and a rider who boards here leaves the boarding wait later. The row's
// own value and the order the rows are sorted into are the same number, and
// come from here so they cannot drift apart.
function departureSecsOf(station: ReachableStation, children: ReachableStation[]): number {
  return remainingSecsOf(station) - departWaitSecs(station.station_slug, children)
}

// The services the rider can leave a station on, one per onward branch.
function departingServices(children: ReachableStation[]): (string | undefined)[] {
  return children.map((child) => lastLeg(child)?.service_id)
}

/**
 * Turns one chain response into the rows and connectors of the graph.
 *
 * Rows are ordered by time remaining, descending, so reading down the list is
 * reading forward through the trip. Ordering is on seconds and rounding happens
 * only at display, so a row never sorts out of place because two values
 * truncated to the same minute; ties break on slug so one query always draws
 * the same picture.
 *
 * Lanes are assigned in the manner of a commit graph, because sorting by time
 * rather than grouping by branch means connectors cross. Walking the rows in
 * order, each takes the lane reserved for it, hands that lane to the first
 * branch leaving it, and opens a lane for every branch after — reusing one
 * freed by a branch that ended before opening a new one.
 */
export function buildTimeRemainingGraph(
  metadata: ChainMetadata | null,
  context: TimeRemainingContext,
): TimeRemainingGraph {
  if (!metadata || !metadata.reachable_stations.length) return { rows: [], laneCount: 0 }

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

  const originRow = buildOriginRow(metadata, childrenOf.get(ORIGIN_KEY) ?? [], context)
  const rows = [
    originRow,
    ...ordered.map((station) =>
      buildStationRow(station, parentKeyOf(station), childrenOf.get(station.station_slug) ?? [], context),
    ),
  ]

  return { rows, laneCount: assignLanes(rows, childrenOf) }
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
  parentKey: string,
  children: ReachableStation[],
  context: TimeRemainingContext,
): TimeRemainingRow {
  const arrival = lastLeg(station)
  const arrivedOn = arrival?.service_id
  const dwellSecs = arrival?.dwell_s ?? 0
  const waitSecs = departWaitSecs(station.station_slug, children)
  const remainingSecs = departureSecsOf(station, children)

  // A station that forks can leave on more than one service. Staying aboard is
  // what the flag names where that is possible, so a fork does not read as a
  // change of service the rider is not obliged to make — and the change is
  // reported only where every branch onward requires one, which is what makes
  // the row genuinely an interchange.
  const onward = departingServices(children)
  const staysAboard = arrivedOn !== undefined && onward.includes(arrivedOn)
  const departsOn = staysAboard ? arrivedOn : onward[0]

  const detail: RowDetail = {}
  if (dwellSecs + waitSecs > 0) detail.arrivalSecs = remainingSecs + dwellSecs + waitSecs
  if (dwellSecs > 0) detail.dwellSecs = dwellSecs
  if (arrivedOn && onward.length && !staysAboard) detail.transferFrom = context.serviceName(arrivedOn)
  if (arrival) detail.rideSecs = arrival.secs - (arrival.dwell_s ?? 0)

  return {
    key: station.station_slug,
    slug: station.station_slug,
    label: context.stationName(station.station_slug),
    remainingSecs,
    flag: departsOn ? context.serviceName(departsOn) : null,
    parentKey,
    detail,
    lane: 0,
    through: [],
    forks: [],
    incoming: true,
  }
}

// Walks the rows top to bottom, keeping one slot per lane naming the row that
// lane is reserved for. Mutates the rows with the geometry it works out and
// reports how many lanes the graph ended up needing.
function assignLanes(
  rows: TimeRemainingRow[],
  childrenOf: Map<string, ReachableStation[]>,
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
      reserved[childLane] = child.station_slug
      return childLane
    })

    laneCount = Math.max(laneCount, reserved.length)
  }
  return laneCount
}
