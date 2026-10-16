// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { Route, SegmentTime, Station } from '../api/scenarios'
import type { ChainMetadata } from '../fixtures/isochrone'
import { buildTimeRemainingGraph } from './timeRemaining'
import { hasReturnTimes, reachedCount, readPlot, stationLines, stationNames, stationRows } from './stationsCard'
import type { StationLine } from './stationsCard'

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

const stations = [
  station('sf', 'San Francisco'),
  station('sj', 'San Jose'),
  station('fresno', 'Fresno'),
  station('bfd', 'Bakersfield'),
  station('palmdale', 'Palmdale'),
  station('vegas', 'Las Vegas'),
]
const name = stationNames(stations)

const segments: SegmentTime[] = [
  { from: 'sf', to: 'sj', run_seconds: 900, route_id: 'hsr' },
  { from: 'sj', to: 'fresno', run_seconds: 3000, reverse_run_seconds: 3100, route_id: 'hsr' },
  { from: 'fresno', to: 'bfd', run_seconds: 1500, route_id: 'hsr' },
  { from: 'bfd', to: 'palmdale', run_seconds: 1800, route_id: 'hsr' },
  { from: 'palmdale', to: 'vegas', run_seconds: 6000, route_id: 'blw' },
]
const routes = [route('hsr', 'CA HSR — San Francisco to Palmdale'), route('blw', 'Brightline West — Palmdale to Las Vegas')]

const lines = stationLines(segments, routes, name)
const [hsr, blw] = lines

// Boarded at Fresno; an express to San Jose (passing nothing here, but over
// one hop), a local to Bakersfield, and out of time on to Palmdale.
const metadata: ChainMetadata = {
  reachable_stations: [
    { station_slug: 'fresno', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
    {
      station_slug: 'sj',
      access_mins: 5,
      access_secs: 300,
      remaining_mins: 65,
      remaining_secs: 3900,
      predecessor_slug: 'fresno',
      board_slug: 'fresno',
      legs: [{ from: 'fresno', to: 'sj', service_id: 'express', secs: 3000 }],
    },
    {
      station_slug: 'sf',
      access_mins: 5,
      access_secs: 300,
      remaining_mins: 50,
      remaining_secs: 3000,
      predecessor_slug: 'sj',
      board_slug: 'fresno',
      legs: [
        { from: 'fresno', to: 'sj', service_id: 'express', secs: 3000 },
        { from: 'sj', to: 'sf', service_id: 'local', secs: 900 },
      ],
    },
    {
      station_slug: 'bfd',
      access_mins: 5,
      access_secs: 300,
      remaining_mins: 90,
      remaining_secs: 5400,
      predecessor_slug: 'fresno',
      board_slug: 'fresno',
      legs: [{ from: 'fresno', to: 'bfd', service_id: 'local', secs: 1500 }],
    },
  ],
  trip_progress: [{
    from: 'bfd',
    to: 'palmdale',
    route_id: 'hsr',
    service_id: 'local',
    fraction: 0.4,
    from_chainage_m: 0,
    to_chainage_m: 1,
    remaining_secs: 0,
    ride_secs: 1800,
  }],
  origin_budget_mins: 120,
  compile_job_id: 'compile-1',
  mode: 'transit',
  wait_model: 'none',
  origin_iso_available: true,
}

function plotOf(meta: ChainMetadata) {
  const graph = buildTimeRemainingGraph(meta, {
    stationName: name,
    serviceName: (id) => (id === 'express' ? 'HSR Express' : 'HSR Local'),
    mode: meta.mode,
  })
  return readPlot(meta, graph)!
}

describe('stationLines', () => {
  it('makes one line per route, stops in line order, named after the route', () => {
    expect(lines.map((l) => l.label)).toEqual([
      'CA HSR — San Francisco to Palmdale',
      'Brightline West — Palmdale to Las Vegas',
    ])
    expect(hsr.stops).toEqual(['sf', 'sj', 'fresno', 'bfd', 'palmdale'])
  })

  it('names a line no route is on after its two ends', () => {
    const [line] = stationLines([{ from: 'sf', to: 'sj', run_seconds: 900 }], [], name)
    expect(line.label).toBe('San Francisco – San Jose')
  })

  it('knows which lines run at different times each way', () => {
    expect(hasReturnTimes(hsr)).toBe(true)
    expect(hasReturnTimes(blw)).toBe(false)
  })
})

describe('stationRows before a plot', () => {
  it('reads the timetable in line order with no time left', () => {
    const rows = stationRows(hsr, lines, name, null)
    expect(rows.map((r) => r.name)).toEqual(['San Francisco', 'San Jose', 'Fresno', 'Bakersfield', 'Palmdale'])
    expect(rows.map((r) => r.hop?.seconds ?? null)).toEqual([900, 3000, 1500, 1800, null])
    expect(rows.every((r) => r.remainingSecs === null && r.hop?.state !== 'ridden')).toBe(true)
  })

  it('reads the return direction from its own run times', () => {
    const rows = stationRows(hsr, lines, name, null, true)
    expect(rows.map((r) => r.slug)).toEqual(['palmdale', 'bfd', 'fresno', 'sj', 'sf'])
    expect(rows.map((r) => r.hop?.seconds ?? null)).toEqual([1800, 1500, 3100, 900, null])
  })

  it('notes the other routes a station is on', () => {
    const rows = stationRows(hsr, lines, name, null)
    expect(rows.find((r) => r.slug === 'palmdale')!.alsoOn).toEqual(['Brightline West'])
    expect(rows.find((r) => r.slug === 'sf')!.alsoOn).toEqual([])
  })
})

describe('stationRows after a plot', () => {
  const plot = plotOf(metadata)
  const rows = stationRows(hsr, lines, name, plot)
  const row = (slug: string) => rows.find((r) => r.slug === slug)!

  it('stays in line order, whichever way it was asked for', () => {
    expect(stationRows(hsr, lines, name, plot, true).map((r) => r.slug)).toEqual(hsr.stops)
  })

  it('gives each reached station its time left, and none to the rest', () => {
    expect(rows.map((r) => r.remainingSecs)).toEqual([3000, 3900, 6900, 5400, null])
  })

  it('agrees with the graph, which the map reads too', () => {
    const graph = buildTimeRemainingGraph(metadata, { stationName: name, serviceName: (id) => id, mode: 'transit' })
    const sj = graph.views.flatMap((v) => v.rows).find((r) => r.slug === 'sj')!
    expect(row('sj').remainingSecs).toBe(sj.remainingSecs)
  })

  it('marks the station boarded from the starting point, with its access time', () => {
    expect(row('fresno').boardedAfterSecs).toBe(300)
    expect(row('bfd').boardedAfterSecs).toBeNull()
  })

  it('reads each ridden hop in the direction ridden, at that direction’s run time', () => {
    expect(row('sj').hop).toEqual({ seconds: 3100, state: 'ridden', ridden: 'up' })
    expect(row('fresno').hop).toEqual({ seconds: 1500, state: 'ridden', ridden: 'down' })
    expect(row('sf').hop).toEqual({ seconds: 900, state: 'ridden', ridden: 'up' })
  })

  it('counts a hop an express passed over as ridden', () => {
    const [line] = stationLines(
      [
        { from: 'fresno', to: 'bfd', run_seconds: 1500 },
        { from: 'bfd', to: 'palmdale', run_seconds: 1800 },
      ],
      [],
      name,
    )
    const express = plotOf({
      ...metadata,
      trip_progress: [],
      reachable_stations: [
        metadata.reachable_stations[0],
        {
          station_slug: 'palmdale',
          access_mins: 5,
          remaining_mins: 60,
          predecessor_slug: 'fresno',
          legs: [{ from: 'fresno', to: 'palmdale', service_id: 'express', secs: 3300 }],
        },
      ],
    })
    expect(stationRows(line, [line], name, express).map((r) => r.hop?.state ?? null))
      .toEqual(['ridden', 'ridden', null])
  })

  it('reads a hop the budget ran out on as unfinished, with how far it got', () => {
    expect(row('bfd').hop).toEqual({ seconds: 1800, state: 'unfinished', ridden: 'down', fraction: 0.4 })
  })

  it('leaves a hop nobody rode unridden', () => {
    const vegas = stationRows(blw, lines, name, plot)
    expect(vegas[0].hop).toEqual({ seconds: 6000, state: 'unridden', ridden: null })
  })

  it('names where a station was ridden in from, and a change of train', () => {
    expect(row('sf').rodeInFrom).toBe('San Jose')
    expect(row('sj').changedFrom).toBe('HSR Express')
    expect(row('fresno').rodeInFrom).toBeNull()
  })

  it('finds a change of train the graph settles only in the onward line’s view', () => {
    const spur = stationLines(
      [
        { from: 'sj', to: 'fresno', run_seconds: 3000, route_id: 'hsr' },
        { from: 'fresno', to: 'bfd', run_seconds: 1500, route_id: 'spur' },
      ],
      [route('hsr', 'CA HSR'), route('spur', 'Spur')],
      name,
    )
    const changed: ChainMetadata = {
      ...metadata,
      trip_progress: [],
      reachable_stations: [
        { station_slug: 'sj', access_mins: 5, remaining_mins: 115 },
        {
          station_slug: 'fresno',
          access_mins: 5,
          remaining_mins: 60,
          predecessor_slug: 'sj',
          legs: [{ from: 'sj', to: 'fresno', service_id: 'local', secs: 3000 }],
        },
        {
          station_slug: 'bfd',
          access_mins: 5,
          remaining_mins: 30,
          predecessor_slug: 'fresno',
          legs: [
            { from: 'sj', to: 'fresno', service_id: 'local', secs: 3000 },
            { from: 'fresno', to: 'bfd', service_id: 'shuttle', secs: 1500 },
          ],
        },
      ],
    }
    // One view per route, as the network page groups them.
    const graph = buildTimeRemainingGraph(changed, {
      stationName: name,
      serviceName: (id) => (id === 'local' ? 'HSR Local' : 'Spur Shuttle'),
      line: (id) => (id === 'local' ? { key: 'hsr', label: 'CA HSR' } : { key: 'spur', label: 'Spur' }),
      mode: 'transit',
    })
    expect(graph.views.map((v) => v.key)).toEqual(['hsr', 'spur'])

    const fresno = stationRows(spur[0], spur, name, readPlot(changed, graph)).find((r) => r.slug === 'fresno')!
    expect(fresno.changedFrom).toBe('HSR Local')
  })

  it('counts the stations reached on each line', () => {
    expect(reachedCount(hsr, plot)).toBe(4)
    expect(reachedCount(blw, plot)).toBe(0)
  })

  it('knows a plot that rode nothing', () => {
    expect(plot.rodeNothing).toBe(false)
    const walked = plotOf({ ...metadata, trip_progress: [], reachable_stations: [metadata.reachable_stations[0]] })
    expect(walked.rodeNothing).toBe(true)
  })
})

describe('readPlot', () => {
  it('has nothing to read without a station reached', () => {
    const graph = { views: [] }
    expect(readPlot(null, graph)).toBeNull()
    expect(readPlot({ ...metadata, reachable_stations: [] }, graph)).toBeNull()
  })
})

// Keeps the fixture honest: every station the plot names is on a line.
it('fixture stations are all on a line', () => {
  const onALine = new Set(lines.flatMap((l: StationLine) => l.stops))
  expect(metadata.reachable_stations.every((s) => onALine.has(s.station_slug))).toBe(true)
})
