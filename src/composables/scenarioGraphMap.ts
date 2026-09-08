import type { TransitGraph } from '../api/authoring'
import type { Route, Station } from '../api/scenarios'

// Display-only glue from a compiled graph onto the shapes MapView draws —
// scenario_id and the physics fields MapView never reads are filled with empties.
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

// A service's stops follow its route, so the connecting line is the route's own
// geometry — not a straight chord between stops, which would cut every curve.
// The geometry is bundled onto the graph read by the API (SPA-133); absent it,
// no lines.
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
