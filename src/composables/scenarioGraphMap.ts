import type { TransitGraph } from '../api/authoring'
import type { Route, Station } from '../api/scenarios'

// Projects a compiled scenario graph onto the shapes MapView draws. The graph
// carries stops as nodes (a slug and a position) and connections as per-service
// edges (a pair of node slugs); MapView wants Stations (points) and Routes
// (LineStrings). This is display-only glue — scenario_id and the physics fields
// MapView never reads are filled with empties.

// Each graph node becomes one station dot at its position.
export function graphStations(graph: TransitGraph | null): Station[] {
  return (graph?.nodes ?? []).map((node) => ({
    id: node.slug,
    scenario_id: '',
    slug: node.slug,
    name: node.names[0] ?? node.slug,
    location: { type: 'Point', coordinates: [node.lng, node.lat] },
    platform_height: '',
  }))
}

// Each edge becomes a two-point line between its endpoint nodes. Edges whose
// endpoints aren't in the node set are dropped rather than drawn to nowhere.
export function graphRoutes(graph: TransitGraph | null): Route[] {
  if (!graph) return []
  const nodeBySlug = new Map(graph.nodes?.map((node) => [node.slug, node]) ?? [])
  const routes: Route[] = []
  for (const service of graph.services) {
    for (const edge of service.edges) {
      const from = nodeBySlug.get(edge.from_slug)
      const to = nodeBySlug.get(edge.to_slug)
      if (!from || !to) continue
      routes.push({
        id: `${service.service_id}:${edge.from_slug}->${edge.to_slug}`,
        scenario_id: '',
        name: '',
        mode: '',
        geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
        bidirectional: true,
      })
    }
  }
  return routes
}
