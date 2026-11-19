import type { GraphEdge, Service, TransitGraph } from '../api/authoring/types'
import { UNNAMED_LINE, UNNAMED_STATION } from '../copy/names'

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

export function directionStops(direction: StationTimeDirection): string[] {
  const { rows } = direction
  if (!rows.length) return []
  return [rows[0].from, ...rows.map((row) => row.to)]
}

export function directionSeconds(direction: StationTimeDirection): number {
  return direction.rows.reduce((sum, row) => sum + row.seconds, 0)
}

export function formatTotalTime(total: number): string {
  // A whole line is summarised to the minute; the hop rows keep m:ss.
  const minutes = Math.round(total / 60)
  const hours = Math.floor(minutes / 60)
  if (!hours) return `${minutes} min`
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`
}

function nameResolver(entries: [string, string][]): (slug: string) => string {
  const names = new Map(entries)
  return (slug) => names.get(slug) ?? UNNAMED_STATION
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

export function graphStationTimeGroups(
  graph: TransitGraph | null,
  services: Pick<Service, 'id' | 'name'>[],
): StationTimeGroup[] {
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
        label: services.find((s) => s.id === member.service_id)?.name ?? UNNAMED_LINE,
        directions: directionsFrom(outbound, returning),
      }
    })
}
