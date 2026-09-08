import type { GraphEdge, Service, TransitGraph } from '../api/authoring/types'
import type { Route, SegmentTime, Station } from '../api/scenarios'

export interface StationTimeRow {
  from: string
  to: string
  seconds: number
}

export interface StationTimeDirection {
  terminus: string
  rows: StationTimeRow[]
}

export interface StationTimeGroup {
  key: string
  label: string | null
  directions: StationTimeDirection[]
}

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
