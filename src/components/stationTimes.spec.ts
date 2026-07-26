import { describe, expect, it } from 'vitest'
import { formatRunTime, graphStationTimeGroups, segmentStationTimeGroups } from './stationTimes'
import type { Service, TransitGraph } from '../api/authoring/types'
import type { Station } from '../api/scenarios'

function service(id: string, name: string): Service {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    route_id: 'route-1',
    name,
    stops: [],
    vehicle: { max_speed_kmh: 200, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 },
    frequency_windows: [],
  }
}

function station(slug: string, name: string): Station {
  return {
    id: slug,
    scenario_id: 'ca-hsr',
    slug,
    name,
    location: { type: 'Point', coordinates: [0, 0] },
    platform_height: 'high',
  }
}

const nodes = [
  { slug: 'sf', lat: 37.7, lng: -122.4, names: ['San Francisco'] },
  { slug: 'sj', lat: 37.3, lng: -121.9, names: ['San Jose'] },
  { slug: 'fresno', lat: 36.7, lng: -119.8, names: ['Fresno'] },
]

// The compiler emits each hop as an adjacent forward/reverse pair, in stop
// order, and the two directions differ by the dwell at the stop each one
// arrives at — so the return leg is not simply a mirror of the outbound.
const graph: TransitGraph = {
  services: [{
    service_id: 'svc1',
    wait_secs: 0,
    edges: [
      { from_slug: 'sf', to_slug: 'sj', seconds: 1800 },
      { from_slug: 'sj', to_slug: 'sf', seconds: 1830 },
      { from_slug: 'sj', to_slug: 'fresno', seconds: 2400 },
      { from_slug: 'fresno', to_slug: 'sj', seconds: 2445 },
    ],
  }],
  nodes,
}

describe('formatRunTime', () => {
  it('renders whole minutes with zero-padded seconds', () => {
    expect(formatRunTime(60)).toBe('1:00')
  })

  it('zero-pads a single-digit seconds remainder', () => {
    expect(formatRunTime(125)).toBe('2:05')
  })

  it('renders a sub-minute run time with a zero minutes place', () => {
    expect(formatRunTime(45)).toBe('0:45')
  })
})

describe('graphStationTimeGroups', () => {
  it('names each group after the service the edges belong to', () => {
    const [group] = graphStationTimeGroups(graph, [service('svc1', 'Coast Line')])
    expect(group.label).toBe('Coast Line')
  })

  it('falls back to the service id when the service is not in the lookup', () => {
    const [group] = graphStationTimeGroups(graph, [])
    expect(group.label).toBe('svc1')
  })

  it('reads the outbound direction in stop order, one row per hop', () => {
    const [group] = graphStationTimeGroups(graph, [])
    expect(group.directions[0].rows).toEqual([
      { from: 'San Francisco', to: 'San Jose', seconds: 1800 },
      { from: 'San Jose', to: 'Fresno', seconds: 2400 },
    ])
  })

  it('reads the return direction from its own edges, not a mirror of the outbound', () => {
    const [group] = graphStationTimeGroups(graph, [])
    expect(group.directions[1].rows).toEqual([
      { from: 'Fresno', to: 'San Jose', seconds: 2445 },
      { from: 'San Jose', to: 'San Francisco', seconds: 1830 },
    ])
  })

  it('names each direction after the terminus it heads for', () => {
    const [group] = graphStationTimeGroups(graph, [])
    expect(group.directions.map((d) => d.terminus)).toEqual(['Fresno', 'San Francisco'])
  })

  it('resolves node slugs to display names, falling back to the slug', () => {
    const unnamed: TransitGraph = { ...graph, nodes: [] }
    const [group] = graphStationTimeGroups(unnamed, [])
    expect(group.directions[0].rows[0]).toEqual({ from: 'sf', to: 'sj', seconds: 1800 })
  })

  it('offers only one direction for a service compiled one way', () => {
    const oneWay: TransitGraph = {
      services: [{
        service_id: 'svc1',
        wait_secs: 0,
        edges: [{ from_slug: 'sf', to_slug: 'sj', seconds: 1800 }],
      }],
      nodes,
    }
    const [group] = graphStationTimeGroups(oneWay, [])
    expect(group.directions).toHaveLength(1)
    expect(group.directions[0].rows).toEqual([
      { from: 'San Francisco', to: 'San Jose', seconds: 1800 },
    ])
  })

  it('drops services that compiled no edges', () => {
    const empty: TransitGraph = {
      services: [{ service_id: 'svc2', wait_secs: 0, edges: [] }],
      nodes: [],
    }
    expect(graphStationTimeGroups(empty, [])).toEqual([])
  })
})

describe('segmentStationTimeGroups', () => {
  const segments = [
    { from: 'sf', to: 'sj', run_seconds: 1800 },
    { from: 'sj', to: 'fresno', run_seconds: 2400 },
  ]
  const stations = [station('sf', 'San Francisco'), station('sj', 'San Jose')]

  it('collects every segment into a single group', () => {
    expect(segmentStationTimeGroups(segments, stations)).toHaveLength(1)
  })

  it('resolves station slugs to names and falls back to the slug', () => {
    const [group] = segmentStationTimeGroups(segments, stations)
    expect(group.directions[0].rows).toEqual([
      { from: 'San Francisco', to: 'San Jose', seconds: 1800 },
      { from: 'San Jose', to: 'fresno', seconds: 2400 },
    ])
  })

  it('offers the stored direction only, since the reverse is not served', () => {
    const [group] = segmentStationTimeGroups(segments, stations)
    expect(group.directions).toHaveLength(1)
  })

  it('leaves the group unlabelled, since segments carry no service id yet', () => {
    const [group] = segmentStationTimeGroups(segments, stations)
    expect(group.label).toBeNull()
  })

  it('returns no groups when the scenario has no segments', () => {
    expect(segmentStationTimeGroups([], stations)).toEqual([])
  })
})
