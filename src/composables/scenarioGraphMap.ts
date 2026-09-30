import type { TransitGraph } from '../api/authoring'
import type { Route, Station } from '../api/scenarios'

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
