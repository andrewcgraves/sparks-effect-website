import type { ChainMetadata, JourneyLeg, ReachableStation } from '../fixtures/isochrone'

/**
 * The trip a plotted isochrone describes, as one branching graph per line.
 *
 * A scenario's whole reachability tree drawn at once is a thicket: every line
 * and every access option crossing in one connector column. Split one line to a
 * view and the picture is a shape a rider recognises — a trunk with the two
 * directions of travel forking off wherever they boarded it.
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
// their room, down to a floor past which they stop shrinking and the column
// takes the extra width from the names instead — which only a graph branching
// nine lanes deep can reach, and is the better of two bad answers, since lanes
// thinner than the floor cannot be told apart anyway.
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

// The key of the fallback view: the stations the rider reaches without boarding
// anything, offered only when there is no line to read instead. See
// viewMemberships.
export const ACCESS_VIEW_KEY = 'access'

/**
 * One line's worth of the trip: the rows to draw and how many lanes they need.
 *
 * A station belongs to the view of the line it *arrives* on, so no station is
 * listed twice as a destination. The station the rider boards that line at
 * comes with it, as the root the branches hang from — which is the one row a
 * view borrows from elsewhere, and the reason an interchange shows up in two
 * views: as somewhere to get to in one, and as somewhere to get on in the next.
 *
 * Where several services share a line, they are branches within one view rather
 * than views of their own, and each row's flag names the service — so a change
 * of train on the same railway still reads as a change.
 */
export interface TimeRemainingView {
  key: string
  label: string
  rows: TimeRemainingRow[]
  laneCount: number
}

export interface TimeRemainingGraph {
  views: TimeRemainingView[]
}

// What the graph needs from the page to render a wire payload as words: the
// resolvers that turn ids into names, and the travel mode the trip was plotted
// for, which is how the rider leaves the starting location.
export interface TimeRemainingContext {
  stationName: (slug: string) => string
  serviceName: (id: string) => string
  /**
   * The line a service runs over, and what to call it.
   *
   * Views are one per line, not one per service, because a rider thinks in
   * lines: an express and a local pattern over one railway are two services and
   * one route, and offered as two views they read as two separate journeys to
   * the same places. Gathered into one view they read as what they are —
   * branches of a line, the express running past the stops the local calls at.
   *
   * Optional, because it is the page that knows about routes and an API too old
   * to report them leaves it unable to answer. Absent, every service stands as
   * its own line, which is what this card drew before.
   */
  line?: (serviceID: string) => { key: string; label: string }
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
 * A line's name, cut down to the part that actually names it.
 *
 * Route names here run "<line> — <where it runs from and to>", and the extent is
 * the longer half: "CA HSR Phase 1 — San Francisco to Anaheim". On a switch
 * between lines the extent is exactly what the rows underneath already say,
 * station by station, so only the part before the dash is kept.
 *
 * The separator has to be a dash with space around it, so that a hyphen inside
 * a word survives — "Trans-Bay Link" is not a line called "Trans". A name with
 * no separator, or nothing before one, is given back whole.
 */
export function shortLineName(name: string): string {
  const head = name.split(/\s+[—–-]\s+/)[0].trim()
  return head || name
}

/**
 * How wide one lane may be, given how many the graph needs.
 *
 * Lanes share the column until sharing would make them illegible, and then stop
 * shrinking. Past that the total outgrows the column and the names beside it
 * give up the difference.
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

/**
 * Turns one chain response into one graph per line the rider can ride.
 *
 * A station belongs to the view of the line it arrives on; the stations reached
 * without boarding anything make a view of their own, labelled with the travel
 * mode, and it comes first because it is the trip's first leg. Each view also
 * carries the station its branches hang from — the row the rider boards that
 * line at — re-rooted onto the starting location, since the journey that led
 * there is another view's story.
 *
 * Within a view, rows are ordered by time remaining, descending, so reading
 * down the list is reading forward through the trip. Ordering is on seconds and
 * rounding happens only at display, so a row never sorts out of place because
 * two values truncated to the same minute; ties break on slug so one query
 * always draws the same picture.
 *
 * Lanes are assigned in the manner of a commit graph, because sorting by time
 * rather than grouping by branch means connectors cross. Walking the rows in
 * order, each takes the lane reserved for it, hands that lane to the first
 * branch leaving it, and opens a lane for every branch after — reusing one
 * freed by a branch that ended before opening a new one. A rider who boards
 * mid-line therefore sees the two directions of travel fork at the station they
 * got on, which is the shape the view exists to show.
 */
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

  const trip: Trip = {
    originRow,
    content,
    arrivedOn: new Map(ordered.map((station) => [station.station_slug, lastLeg(station)?.service_id])),
    byRemaining: (a, b) => byRemaining(bySlug.get(a)!, bySlug.get(b)!),
    context,
  }

  const views = viewMemberships(ordered, bySlug, parentKeyOf, context).map((membership) =>
    buildView(membership, trip),
  )
  return { views: views.filter((view) => view.rows.length > 1) }
}

// Everything a view needs from the trip as a whole, gathered once: the rows
// already worked out, the service each station is arrived on, the order they
// are read in, and how to name things.
interface Trip {
  originRow: TimeRemainingRow
  content: Map<string, TimeRemainingRow>
  arrivedOn: Map<string, string | undefined>
  byRemaining: (a: string, b: string) => number
  context: TimeRemainingContext
}

interface ViewMembership {
  key: string
  label: string
  members: string[]
}

/**
 * Which stations each view holds, in the order the views are offered: one view
 * per line, ordered by the first station each reaches, so the line that gets
 * the rider furthest is offered first.
 *
 * The access leg gets no view of its own where there is a line to read instead.
 * The stations a rider reaches without boarding anything are the stations they
 * board at, and each already appears in the view of the line they board — as
 * the root its branches hang from, with the leg out of the starting location
 * drawn above it. A tab of its own restated that, and on a drive, where the
 * reach is wide enough to touch several stations that are nothing to do with
 * each other, it restated it as a row of unconnected stubs (SPA-243).
 *
 * It survives as the fallback for a trip that boards nothing at all: a plot
 * whose whole story is the walk to a station still has that story to tell, and
 * nothing else to tell it in. Being the only view, it is never a tab beside a
 * line — the card shows no switcher for a single view.
 */
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

// Lays one view's rows out: re-rooted onto the starting location where the row
// they came from is not in this view, sorted, and given the lane geometry and
// the departure this view sees.
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

// How the rider leaves a station, read inside one view: the service they board,
// and whether boarding it is a change.
//
// Staying aboard is what the flag names where the rider can, so a station where
// the line simply carries on does not read as a change they are not obliged to
// make; a change is reported only where every branch onward requires one. Read
// per view, this also says the right thing at an interchange: on the line the
// rider arrives by, the branch ends and the row is unflagged, and on the line
// they leave by, the same station is where they get on.
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

// Walks the rows top to bottom, keeping one slot per lane naming the row that
// lane is reserved for. Mutates the rows with the geometry it works out and
// reports how many lanes the graph ended up needing.
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
