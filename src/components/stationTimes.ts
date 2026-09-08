import type { GraphEdge, Service, TransitGraph } from '../api/authoring/types'
import type { Route, SegmentTime, Station } from '../api/scenarios'

// Endpoints already resolved to display names, so the table never has to know
// where a name came from.
export interface StationTimeRow {
  from: string
  to: string
  seconds: number
}

// Directions are not mirrors of each other: the compiler charges the dwell of
// the stop each leg arrives at, so the same hop can differ by direction.
export interface StationTimeDirection {
  terminus: string
  rows: StationTimeRow[]
}

// A group with two directions gets a toggle; one direction (a one-way compile,
// or seeded data that stores a single direction) is shown as it is. `label` is
// null when the rows cannot be attributed to a named service, which is the
// seeded case until segments carry service ids.
export interface StationTimeGroup {
  key: string
  label: string | null
  directions: StationTimeDirection[]
}

// Shared with the compile table so the same segment reads the same on both screens.
export function formatRunTime(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function nameResolver(entries: [string, string][]): (slug: string) => string {
  const names = new Map(entries)
  return (slug) => names.get(slug) ?? slug
}

function directionsFrom(rows: StationTimeRow[], returnRows: StationTimeRow[]): StationTimeDirection[] {
  const outbound = { terminus: rows[rows.length - 1].to, rows }
  if (!returnRows.length) return [outbound]
  return [outbound, { terminus: returnRows[returnRows.length - 1].to, rows: returnRows }]
}

// Splits a service's compiled edges into the two ways of riding it. The
// compiler emits each hop as a forward edge followed by its return leg, so
// the first time a station pair is seen is the outbound direction and the
// second is the return; a hop compiled only one way yields no return leg.
function splitByDirection(edges: GraphEdge[], displayName: (slug: string) => string) {
  const outbound: StationTimeRow[] = []
  const returning: StationTimeRow[] = []
  const seen = new Set<string>()

  for (const edge of edges) {
    const pair = [edge.from_slug, edge.to_slug].sort().join('\u0000')
    const row = { from: displayName(edge.from_slug), to: displayName(edge.to_slug), seconds: edge.seconds }
    if (seen.has(pair)) {
      returning.unshift(row)
    } else {
      seen.add(pair)
      outbound.push(row)
    }
  }
  return { outbound, returning }
}

// A compiled graph as one group per member service, each read in stop order
// by default. A graph still being read yields no groups, which the caller
// distinguishes from "compiled to nothing" by its own loading flag. Services
// that compiled no edges are dropped rather than shown as empty groups — a
// single-stop service has nothing to say about time between stations.
export function graphStationTimeGroups(graph: TransitGraph | null, services: Service[]): StationTimeGroup[] {
  if (!graph) return []

  const displayName = nameResolver(
    (graph.nodes ?? []).filter((node) => node.names.length).map((node) => [node.slug, node.names[0]]),
  )

  return graph.services
    .filter((member) => member.edges.length > 0)
    .map((member) => {
      const { outbound, returning } = splitByDirection(member.edges, displayName)
      return {
        key: member.service_id,
        label: services.find((s) => s.id === member.service_id)?.name ?? member.service_id,
        directions: directionsFrom(outbound, returning),
      }
    })
}

// A seeded scenario's segments, read one line at a time. The endpoint serves
// the segments of every route in one list, so they have to be grouped by
// route_id before they can be read in stop order: a scenario is several
// corridors laid end to end, not one path, and the later ones branch off the
// middle of an earlier one rather than continuing from its terminus. Each
// group's return direction is built from its own hops' reverse_run_seconds,
// falling back to run_seconds; two directions are shown only when at least one
// hop in that group actually differs.
export function segmentStationTimeGroups(
  segments: SegmentTime[],
  stations: Station[],
  routes: Route[] = [],
): StationTimeGroup[] {
  if (!segments.length) return []

  const displayName = nameResolver(stations.map((s) => [s.slug, s.name]))

  // Keyed by route, in the order the routes first appear, so the list still
  // reads in the order the API served it. Segments from an API that reports no
  // route_id all land under the same undefined key, which is the pre-SPA-245
  // behaviour of one group for the whole scenario.
  const byRoute = new Map<string | undefined, SegmentTime[]>()
  for (const segment of segments) {
    const group = byRoute.get(segment.route_id)
    if (group) group.push(segment)
    else byRoute.set(segment.route_id, [segment])
  }

  return Array.from(byRoute, ([routeId, hops]) => {
    const rows = hops.map((segment) => ({
      from: displayName(segment.from),
      to: displayName(segment.to),
      seconds: segment.run_seconds,
    }))
    const returnRows = hops.map((segment) => ({
      from: displayName(segment.to),
      to: displayName(segment.from),
      seconds: segment.reverse_run_seconds ?? segment.run_seconds,
    })).reverse()
    const asymmetric = hops.some(
      (segment) => (segment.reverse_run_seconds ?? segment.run_seconds) !== segment.run_seconds,
    )

    return {
      key: routeId ?? 'seeded',
      label: groupLabel(routeId, routes, rows, byRoute.size > 1),
      directions: directionsFrom(rows, asymmetric ? returnRows : []),
    }
  })
}

// What to head a seeded group with. The route's own name when it can be
// resolved; otherwise nothing when the scenario is a single group, since a
// lone table has nothing to be told apart from. Several groups always get a
// heading — two unheaded tables one above the other are unreadable — and an
// unresolved route is headed by the corridor it covers, which says more to a
// reader than the bare uuid the route id is.
function groupLabel(
  routeId: string | undefined,
  routes: Route[],
  rows: StationTimeRow[],
  several: boolean,
): string | null {
  const named = routeId ? routes.find((r) => r.id === routeId)?.name : undefined
  if (named) return named
  if (!several) return null
  return `${rows[0].from} – ${rows[rows.length - 1].to}`
}
