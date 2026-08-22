import { describe, expect, it } from 'vitest'
import { formatRunTime, graphStationTimeGroups, segmentStationTimeGroups } from './stationTimes'
import type { Service, TransitGraph } from '../api/authoring/types'
import type { Route, Station } from '../api/scenarios'

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

function route(id: string, name: string): Route {
  return {
    id,
    scenario_id: 'ca-hsr',
    name,
    mode: 'rail',
    geometry: { type: 'LineString', coordinates: [] },
    bidirectional: true,
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

  it('offers a single direction when every hop is symmetric', () => {
    const [group] = segmentStationTimeGroups(segments, stations)
    expect(group.directions).toHaveLength(1)
  })

  it('splits into two directions when a hop carries a reverse override', () => {
    const [group] = segmentStationTimeGroups(
      [
        { from: 'sf', to: 'sj', run_seconds: 1800 },
        { from: 'sj', to: 'fresno', run_seconds: 2400, reverse_run_seconds: 2200 },
      ],
      stations,
    )
    expect(group.directions).toHaveLength(2)
    expect(group.directions[0].rows).toEqual([
      { from: 'San Francisco', to: 'San Jose', seconds: 1800 },
      { from: 'San Jose', to: 'fresno', seconds: 2400 },
    ])
    expect(group.directions[1].rows).toEqual([
      { from: 'fresno', to: 'San Jose', seconds: 2200 },
      { from: 'San Jose', to: 'San Francisco', seconds: 1800 },
    ])
  })

  // A stored reverse time that happens to match the forward one is not an
  // asymmetry, so it must not raise a toggle over two tables that read the
  // same. Only an absent override took that path before; an explicit equal
  // value is the case the seed data actually contains.
  it('stays one direction when an explicit reverse override equals the forward run', () => {
    const [group] = segmentStationTimeGroups(
      [
        { from: 'sf', to: 'sj', run_seconds: 1800, reverse_run_seconds: 1800 },
        { from: 'sj', to: 'fresno', run_seconds: 2400, reverse_run_seconds: 2400 },
      ],
      stations,
    )
    expect(group.directions).toHaveLength(1)
    expect(group.directions[0].rows).toEqual([
      { from: 'San Francisco', to: 'San Jose', seconds: 1800 },
      { from: 'San Jose', to: 'fresno', seconds: 2400 },
    ])
  })

  // A scenario served as one path is one table, and a heading over a lone
  // table only repeats the card it sits in. Headings earn their place once
  // there is more than one table to tell apart.
  it('leaves a single group unlabelled', () => {
    const [group] = segmentStationTimeGroups(segments, stations)
    expect(group.label).toBeNull()
  })

  it('returns no groups when the scenario has no segments', () => {
    expect(segmentStationTimeGroups([], stations)).toEqual([])
  })

  // The real shape of the seeded payload: a mainline, then a second line
  // appended after it that branches off a station in the middle of the first
  // rather than continuing from its terminus. Read as one flat list, the
  // return direction walked back off the end of the spur and then jumped
  // straight to the mainline's terminus, and the toggle was named after the
  // spur's terminus over a table of the mainline (SPA-245).
  describe('a scenario of several routes', () => {
    const mainline = route('r-main', 'Phase 1')
    const spur = route('r-spur', 'Brightline West')
    const network = [
      { from: 'sf', to: 'sj', run_seconds: 1800, reverse_run_seconds: 1830, route_id: 'r-main' },
      { from: 'sj', to: 'palmdale', run_seconds: 2400, route_id: 'r-main' },
      { from: 'palmdale', to: 'anaheim', run_seconds: 1200, route_id: 'r-main' },
      { from: 'palmdale', to: 'victor-valley', run_seconds: 1050, route_id: 'r-spur' },
      { from: 'victor-valley', to: 'las-vegas', run_seconds: 5310, reverse_run_seconds: 5400, route_id: 'r-spur' },
    ]
    const networkStations = [
      station('sf', 'San Francisco'),
      station('sj', 'San Jose'),
      station('palmdale', 'Palmdale'),
      station('anaheim', 'Anaheim'),
      station('victor-valley', 'Victor Valley'),
      station('las-vegas', 'Las Vegas'),
    ]

    it('reads each route as its own group, in the order the routes first appear', () => {
      const groups = segmentStationTimeGroups(network, networkStations, [mainline, spur])
      expect(groups.map((g) => g.key)).toEqual(['r-main', 'r-spur'])
    })

    it('heads each group with the name of the route it belongs to', () => {
      const groups = segmentStationTimeGroups(network, networkStations, [mainline, spur])
      expect(groups.map((g) => g.label)).toEqual(['Phase 1', 'Brightline West'])
    })

    it('names each direction after its own route\'s terminus, not the whole payload\'s', () => {
      const groups = segmentStationTimeGroups(network, networkStations, [mainline, spur])
      expect(groups[0].directions.map((d) => d.terminus)).toEqual(['Anaheim', 'San Francisco'])
      expect(groups[1].directions.map((d) => d.terminus)).toEqual(['Las Vegas', 'Palmdale'])
    })

    // Every row has to start where the one above it ended. The old flat
    // reverse put Anaheim->Los Angeles directly after a row arriving at
    // Palmdale, which is not a journey anyone can take.
    it('walks each return direction back along its own path without a discontinuity', () => {
      const groups = segmentStationTimeGroups(network, networkStations, [mainline, spur])
      expect(groups[0].directions[1].rows).toEqual([
        { from: 'Anaheim', to: 'Palmdale', seconds: 1200 },
        { from: 'Palmdale', to: 'San Jose', seconds: 2400 },
        { from: 'San Jose', to: 'San Francisco', seconds: 1830 },
      ])
      expect(groups[1].directions[1].rows).toEqual([
        { from: 'Las Vegas', to: 'Victor Valley', seconds: 5400 },
        { from: 'Victor Valley', to: 'Palmdale', seconds: 1050 },
      ])
    })

    // Symmetry is judged per route: a line whose every hop reads the same both
    // ways has nothing to toggle between, even when the line beside it does.
    it('gives a toggle only to the routes that actually differ by direction', () => {
      const symmetricSpur = network.map((s) =>
        s.route_id === 'r-spur' ? { ...s, reverse_run_seconds: s.run_seconds } : s,
      )
      const groups = segmentStationTimeGroups(symmetricSpur, networkStations, [mainline, spur])
      expect(groups[0].directions).toHaveLength(2)
      expect(groups[1].directions).toHaveLength(1)
    })

    // Two tables one under the other with no headings cannot be told apart, so
    // a route the scenario did not report falls back to the corridor it covers
    // rather than to the uuid it is keyed by.
    it('heads an unresolved route with its endpoints rather than leaving it blank', () => {
      const groups = segmentStationTimeGroups(network, networkStations, [mainline])
      expect(groups.map((g) => g.label)).toEqual(['Phase 1', 'Palmdale – Las Vegas'])
    })
  })
})
