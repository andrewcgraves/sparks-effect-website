import type { Service, TransitGraph } from '../api/authoring/types'
import type { SegmentTime, Station } from '../api/scenarios'

// One adjacent-station hop, ready to render: endpoints already resolved to
// display names, so the table never has to know where a name came from.
export interface StationTimeRow {
  from: string
  to: string
  seconds: number
}

// The hops of one service, in the service's own stop order. `termini` names
// the two ends of the chain and doubles as the direction toggle's labels; a
// group without them (seeded data) is shown in its stored direction only.
// `label` is null when the rows cannot be attributed to a named service, which
// is the seeded case until segments carry service ids.
export interface StationTimeGroup {
  key: string
  label: string | null
  rows: StationTimeRow[]
  termini: [string, string] | null
}

// Run time of one adjacent-station hop, as `m:ss`. Matches the compile
// table's formatting so the same segment reads the same on both screens.
export function formatRunTime(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// A compiled graph as one group per member service. Edges arrive in stop
// order, which is the direction the table defaults to. Services that compiled
// no edges are dropped rather than shown as empty groups — a single-stop
// service has nothing to say about time between stations.
export function graphStationTimeGroups(graph: TransitGraph, services: Service[]): StationTimeGroup[] {
  const names = new Map<string, string>()
  for (const node of graph.nodes ?? []) {
    if (node.names.length) names.set(node.slug, node.names[0])
  }
  const displayName = (slug: string) => names.get(slug) ?? slug

  return graph.services
    .filter((member) => member.edges.length > 0)
    .map((member) => {
      const rows = member.edges.map((edge) => ({
        from: displayName(edge.from_slug),
        to: displayName(edge.to_slug),
        seconds: edge.seconds,
      }))
      return {
        key: member.service_id,
        label: services.find((s) => s.id === member.service_id)?.name ?? member.service_id,
        rows,
        termini: [rows[0].from, rows[rows.length - 1].to] as [string, string],
      }
    })
}

// A seeded scenario's segments as one unattributed group. The endpoint does
// not say which service a segment belongs to, so there is nothing to group or
// reverse by yet — that arrives with SPA-152.
export function segmentStationTimeGroups(segments: SegmentTime[], stations: Station[]): StationTimeGroup[] {
  if (!segments.length) return []

  const names = new Map(stations.map((s) => [s.slug, s.name]))
  const displayName = (slug: string) => names.get(slug) ?? slug

  return [{
    key: 'seeded',
    label: null,
    rows: segments.map((segment) => ({
      from: displayName(segment.from),
      to: displayName(segment.to),
      seconds: segment.run_seconds,
    })),
    termini: null,
  }]
}
