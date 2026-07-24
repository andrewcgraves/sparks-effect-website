import { describe, expect, it } from 'vitest'
import { graphStations, graphRoutes } from './scenarioGraphMap'
import type { TransitGraph } from '../api/authoring'

const graph = {
  services: [
    { service_id: 'svc1', wait_secs: 0, edges: [
      { from_slug: 'a', to_slug: 'b', seconds: 120 },
      { from_slug: 'b', to_slug: 'gone', seconds: 90 },
    ] },
  ],
  nodes: [
    { slug: 'a', lat: 35.39, lng: -119.02, names: ['Test'] },
    { slug: 'b', lat: 34.05, lng: -118.23, names: [] },
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

  it('turns each edge into a two-point line between its endpoints', () => {
    const routes = graphRoutes(graph)
    // 'b'->'gone' is dropped: 'gone' is not in nodes.
    expect(routes).toHaveLength(1)
    expect(routes[0].geometry.coordinates).toEqual([[-119.02, 35.39], [-118.23, 34.05]])
  })

  it('returns empty arrays for a null graph', () => {
    expect(graphStations(null)).toEqual([])
    expect(graphRoutes(null)).toEqual([])
  })

  it('handles a graph with no nodes without throwing', () => {
    const g = { services: [{ service_id: 's', wait_secs: 0, edges: [{ from_slug: 'x', to_slug: 'y', seconds: 1 }] }] } as unknown as TransitGraph
    expect(graphRoutes(g)).toEqual([])
    expect(graphStations(g)).toEqual([])
  })
})
