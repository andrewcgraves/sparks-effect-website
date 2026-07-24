import { describe, expect, it } from 'vitest'
import { graphStations, graphRoutes } from './scenarioGraphMap'
import type { TransitGraph } from '../api/authoring'

const graph = {
  services: [
    { service_id: 'svc1', wait_secs: 0, edges: [{ from_slug: 'a', to_slug: 'b', seconds: 120 }] },
  ],
  nodes: [
    { slug: 'a', lat: 35.39, lng: -119.02, names: ['Test'] },
    { slug: 'b', lat: 34.05, lng: -118.23, names: [] },
  ],
  routes: [
    {
      id: 'rt-1',
      slug: 'main-line',
      name: 'Main Line',
      mode: 'rail',
      bidirectional: true,
      // A curved alignment: three points, not the two the stops would chord.
      geometry: { type: 'LineString', coordinates: [[-119.02, 35.39], [-118.6, 34.9], [-118.23, 34.05]] },
      segments: [],
    },
  ],
} as unknown as TransitGraph

describe('scenarioGraphMap', () => {
  it('turns each node into a station at [lng, lat]', () => {
    const stations = graphStations(graph)
    expect(stations).toHaveLength(2)
    expect(stations[0].location.coordinates).toEqual([-119.02, 35.39])
    expect(stations[0].name).toBe('Test')
  })

  it('falls back to the slug when a node has no names', () => {
    expect(graphStations(graph)[1].name).toBe('b')
  })

  it('draws each bundled route by its own alignment, not a chord', () => {
    const routes = graphRoutes(graph)
    expect(routes).toHaveLength(1)
    // The mid-point is preserved: the line follows the route, not stop-to-stop.
    expect(routes[0].geometry.coordinates).toEqual([[-119.02, 35.39], [-118.6, 34.9], [-118.23, 34.05]])
    expect(routes[0].id).toBe('rt-1')
  })

  it('returns empty arrays for a null graph', () => {
    expect(graphStations(null)).toEqual([])
    expect(graphRoutes(null)).toEqual([])
  })

  it('draws no lines when the graph carries no routes', () => {
    const g = { services: [], nodes: [{ slug: 'a', lat: 1, lng: 2, names: [] }] } as unknown as TransitGraph
    expect(graphRoutes(g)).toEqual([])
    expect(graphStations(g)).toHaveLength(1)
  })
})
