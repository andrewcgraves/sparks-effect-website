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

// The member services' route alignments, as MapView route lines. A service's
// stops follow its route, so the connecting line is the route's own geometry —
// not a straight chord between stops, which would cut every curve. The geometry
// is bundled onto the graph read by the API (SPA-133); absent it, no lines.
export function graphRoutes(graph: TransitGraph | null): Route[] {
  return (graph?.routes ?? []).map((route) => ({
    id: route.id,
    scenario_id: route.scenario_id ?? '',
    name: route.name,
    mode: route.mode,
    geometry: route.geometry,
    bidirectional: route.bidirectional,
  }))
}
