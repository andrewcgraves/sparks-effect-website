// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  directionSeconds,
  directionStops,
  formatRunTime,
  formatTotalTime,
  graphStationTimeGroups,
} from './stationTimes'
import type { Service, TransitGraph } from '../api/authoring/types'

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

const nodes = [
  { slug: 'sf', lat: 37.7, lng: -122.4, names: ['San Francisco'] },
  { slug: 'sj', lat: 37.3, lng: -121.9, names: ['San Jose'] },
  { slug: 'fresno', lat: 36.7, lng: -119.8, names: ['Fresno'] },
]

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

describe('formatTotalTime', () => {
  it('rounds a sub-hour total to whole minutes', () => {
    expect(formatTotalTime(21 * 60 + 30)).toBe('22 min')
  })

  it('splits a total of an hour or more into hours and zero-padded minutes', () => {
    expect(formatTotalTime(3 * 3600 + 5 * 60)).toBe('3 h 05 min')
  })
})

describe('directionStops', () => {
  const direction = {
    terminus: 'Fresno',
    rows: [
      { from: 'San Francisco', to: 'San Jose', seconds: 1800 },
      { from: 'San Jose', to: 'Fresno', seconds: 2445 },
    ],
  }

  it('names each station once, in stop order', () => {
    expect(directionStops(direction)).toEqual(['San Francisco', 'San Jose', 'Fresno'])
  })

  it('has no stops for a direction with no hops', () => {
    expect(directionStops({ terminus: 'Fresno', rows: [] })).toEqual([])
  })

  it('totals the run time of every hop', () => {
    expect(directionSeconds(direction)).toBe(4245)
  })
})

describe('graphStationTimeGroups', () => {
  it('names each group after the service the edges belong to', () => {
    const [group] = graphStationTimeGroups(graph, [service('svc1', 'Coast Line')])
    expect(group.label).toBe('Coast Line')
  })

  it('calls a line the lookup has no record of unnamed, never by its id', () => {
    const [group] = graphStationTimeGroups(graph, [])
    expect(group.label).toBe('Unnamed line')
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

  it('calls a node with no name unnamed, never by its slug', () => {
    const unnamed: TransitGraph = { ...graph, nodes: [] }
    const [group] = graphStationTimeGroups(unnamed, [])
    expect(group.directions[0].rows[0])
      .toEqual({ from: 'Unnamed station', to: 'Unnamed station', seconds: 1800 })
    expect(group.directions.map((d) => d.terminus)).toEqual(['Unnamed station', 'Unnamed station'])
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
