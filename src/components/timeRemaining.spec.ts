// @vitest-environment node

import { describe, it, expect } from 'vitest'
import {
  buildTimeRemainingGraph,
  formatDuration,
  formatProgressPercent,
  formatTimeRemaining,
  remainingSecsBySlug,
  laneWidthFor,
  shortLineName,
  ACCESS_VIEW_KEY,
  ORIGIN_KEY,
  MAX_LANE_PX,
  MIN_LANE_PX,
  GRAPH_COLUMN_PX,
} from './timeRemaining'
import type { TimeRemainingView } from './timeRemaining'
import type { ChainMetadata, ReachableStation } from '../fixtures/isochrone'

function metadata(stations: ReachableStation[], budgetMins = 120): ChainMetadata {
  return {
    reachable_stations: stations,
    origin_budget_mins: budgetMins,
    compile_job_id: 'compile-1',
    mode: 'walk',
    wait_model: 'headway_over_2_peak',
    origin_iso_available: true,
  }
}

const INTERCHANGE: ReachableStation[] = [
  {
    station_slug: 'alpha',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 115,
    remaining_secs: 6900,
  },
  {
    station_slug: 'beta',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 90,
    remaining_secs: 5400,
    via_service: 'trunk',
    predecessor_slug: 'alpha',
    board_slug: 'alpha',
    board_wait_secs: 600,
    legs: [{ from: 'alpha', to: 'beta', service_id: 'trunk', secs: 900, dwell_s: 60 }],
  },
  {
    station_slug: 'gamma',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 75,
    remaining_secs: 4500,
    via_service: 'trunk',
    predecessor_slug: 'beta',
    board_slug: 'alpha',
    board_wait_secs: 600,
    legs: [
      { from: 'alpha', to: 'beta', service_id: 'trunk', secs: 900, dwell_s: 60 },
      { from: 'beta', to: 'gamma', service_id: 'trunk', secs: 900, dwell_s: 45 },
    ],
  },
  {
    station_slug: 'delta',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 80,
    remaining_secs: 4800,
    via_service: 'trunk',
    predecessor_slug: 'beta',
    board_slug: 'alpha',
    board_wait_secs: 600,
    legs: [
      { from: 'alpha', to: 'beta', service_id: 'trunk', secs: 900, dwell_s: 60 },
      { from: 'beta', to: 'delta', service_id: 'spur', secs: 600, dwell_s: 30 },
    ],
  },
]

const BOTH_DIRECTIONS: ReachableStation[] = [
  { station_slug: 'middle', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
  {
    station_slug: 'northward',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 100,
    remaining_secs: 6000,
    predecessor_slug: 'middle',
    legs: [{ from: 'middle', to: 'northward', service_id: 'trunk', secs: 900 }],
  },
  {
    station_slug: 'southward',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 91,
    remaining_secs: 5500,
    predecessor_slug: 'middle',
    legs: [{ from: 'middle', to: 'southward', service_id: 'trunk', secs: 1400 }],
  },
]

const SHARED_LINE: ReachableStation[] = [
  { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
  {
    station_slug: 'gamma',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 90,
    remaining_secs: 5400,
    predecessor_slug: 'alpha',
    board_slug: 'alpha',
    board_wait_secs: 600,
    legs: [{ from: 'alpha', to: 'gamma', service_id: 'express', secs: 1500, dwell_s: 60 }],
  },
  {
    station_slug: 'beta',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 83,
    remaining_secs: 5000,
    predecessor_slug: 'alpha',
    board_slug: 'alpha',
    board_wait_secs: 600,
    legs: [{ from: 'alpha', to: 'beta', service_id: 'local', secs: 1900, dwell_s: 60 }],
  },
  {
    station_slug: 'delta',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 70,
    remaining_secs: 4200,
    predecessor_slug: 'gamma',
    board_slug: 'alpha',
    board_wait_secs: 600,
    legs: [
      { from: 'alpha', to: 'gamma', service_id: 'express', secs: 1500, dwell_s: 60 },
      { from: 'gamma', to: 'delta', service_id: 'local', secs: 1200, dwell_s: 30 },
    ],
  },
  {
    station_slug: 'epsilon',
    access_mins: 5,
    access_secs: 300,
    remaining_mins: 60,
    remaining_secs: 3600,
    predecessor_slug: 'beta',
    board_slug: 'alpha',
    board_wait_secs: 600,
    legs: [
      { from: 'alpha', to: 'beta', service_id: 'local', secs: 1900, dwell_s: 60 },
      { from: 'beta', to: 'epsilon', service_id: 'spur', secs: 1400, dwell_s: 30 },
    ],
  },
]

const NAMES: Record<string, string> = {
  alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta', epsilon: 'Epsilon',
  middle: 'Middle', northward: 'Northward', southward: 'Southward',
}
const SERVICES: Record<string, string> = {
  trunk: 'Trunk Line', spur: 'Spur Line', express: 'Express', local: 'Local',
}
const LINES: Record<string, { key: string; label: string }> = {
  express: { key: 'phase-1', label: 'Phase 1' },
  local: { key: 'phase-1', label: 'Phase 1' },
  spur: { key: 'branch', label: 'Branch Line' },
}

function build(stations: ReachableStation[], budgetMins = 120) {
  return buildTimeRemainingGraph(metadata(stations, budgetMins), {
    stationName: (slug) => NAMES[slug] ?? slug,
    serviceName: (id) => SERVICES[id] ?? id,
    mode: 'walk',
  })
}

function buildByLine(stations: ReachableStation[], budgetMins = 120) {
  return buildTimeRemainingGraph(metadata(stations, budgetMins), {
    stationName: (slug) => NAMES[slug] ?? slug,
    serviceName: (id) => SERVICES[id] ?? id,
    line: (id) => LINES[id] ?? { key: id, label: SERVICES[id] ?? id },
    mode: 'walk',
  })
}

function viewFor(stations: ReachableStation[], key: string): TimeRemainingView {
  const view = build(stations).views.find((candidate) => candidate.key === key)
  if (!view) throw new Error(`no view for ${key}`)
  return view
}

function lineViewFor(stations: ReachableStation[], key: string): TimeRemainingView {
  const view = buildByLine(stations).views.find((candidate) => candidate.key === key)
  if (!view) throw new Error(`no view for ${key}`)
  return view
}

function rowFor(view: TimeRemainingView, slug: string) {
  const row = view.rows.find((r) => r.slug === slug)
  if (!row) throw new Error(`no row for ${slug} in view ${view.key}`)
  return row
}

describe('buildTimeRemainingGraph', () => {
  it('yields nothing at all when there is no result to draw', () => {
    expect(buildTimeRemainingGraph(null, {
      stationName: (s) => s,
      serviceName: (s) => s,
      mode: 'walk',
    }).views).toEqual([])
  })

  describe('one view per line', () => {
    it('offers a view per service and nothing else', () => {
      expect(build(INTERCHANGE).views.map((view) => view.key)).toEqual(['trunk', 'spur'])
    })

    it('labels each view with its service', () => {
      expect(build(INTERCHANGE).views.map((view) => view.label)).toEqual(['Trunk Line', 'Spur Line'])
    })

    it('lists a station under the service it arrives on, and no other', () => {
      expect(viewFor(INTERCHANGE, 'trunk').rows.map((r) => r.slug))
        .toEqual([null, 'alpha', 'beta', 'gamma'])
      expect(viewFor(INTERCHANGE, 'spur').rows.map((r) => r.slug)).toEqual([null, 'beta', 'delta'])
    })

    it('carries the station a service is boarded at into its view, as the root its branches hang from', () => {
      // Beta is a destination of the trunk and the boarding point of the spur,
      // and in the spur's view the journey that led there is another view's
      // story — so it hangs off the starting location.
      expect(rowFor(viewFor(INTERCHANGE, 'spur'), 'beta').parentKey).toBe('origin')
      expect(rowFor(viewFor(INTERCHANGE, 'trunk'), 'beta').parentKey).toBe('alpha')
    })

    it('gives the access leg no view of its own where there is a line to read instead', () => {
      // Alpha is the one station reached on foot, and it is already in the
      // trunk's view as the station the rider boards there — which is the
      // whole of what a view of its own had to say (SPA-243).
      expect(build(INTERCHANGE).views.map((v) => v.key)).not.toContain(ACCESS_VIEW_KEY)
      expect(rowFor(viewFor(INTERCHANGE, 'trunk'), 'alpha').parentKey).toBe(ORIGIN_KEY)
    })

    it('falls back to the access leg for a trip that boards nothing at all', () => {
      // A walk to two stations and no service within the budget. The card has
      // only this to say, so it says it rather than showing nothing.
      const nothingRidden: ReachableStation[] = [
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
        { station_slug: 'beta', access_mins: 9, access_secs: 540, remaining_mins: 111, remaining_secs: 6660 },
      ]

      expect(build(nothingRidden).views.map((v) => v.key)).toEqual([ACCESS_VIEW_KEY])
      expect(viewFor(nothingRidden, ACCESS_VIEW_KEY).rows.map((r) => r.slug))
        .toEqual([null, 'alpha', 'beta'])
    })

    it('drops a view with nothing to draw in it', () => {
      // Every station here is ridden to, so nothing was reached on foot.
      const noWalkStations = INTERCHANGE.slice(1)

      expect(build(noWalkStations).views.map((v) => v.key)).not.toContain(ACCESS_VIEW_KEY)
    })

    it('offers one view per line and no more on a trip over a single service', () => {
      expect(build(BOTH_DIRECTIONS).views.map((v) => v.key)).toEqual(['trunk'])
    })
  })

  describe('grouped by the line rather than the timetable', () => {
    it('gathers two stopping patterns over one railway into a single view', () => {
      expect(buildByLine(SHARED_LINE).views.map((v) => v.key))
        .toEqual(['phase-1', 'branch'])
    })

    it('labels a view with the line, not with one of the services running over it', () => {
      expect(buildByLine(SHARED_LINE).views.map((v) => v.label))
        .toEqual(['Phase 1', 'Branch Line'])
    })

    it('draws the express and the local as branches of the one line', () => {
      // Beta is the local's own stop and gamma the express's, so they fork at
      // alpha and the local rejoins the express's branch at gamma.
      const line = lineViewFor(SHARED_LINE, 'phase-1')

      expect(line.rows.map((r) => r.slug)).toEqual([null, 'alpha', 'gamma', 'beta', 'delta'])
      expect(rowFor(line, 'gamma').parentKey).toBe('alpha')
      expect(rowFor(line, 'beta').parentKey).toBe('alpha')
      expect(rowFor(line, 'delta').parentKey).toBe('gamma')
      expect(rowFor(line, 'alpha').forks).toHaveLength(2)
    })

    it('still names the service on each row, which is what the branches differ by', () => {
      const line = lineViewFor(SHARED_LINE, 'phase-1')

      expect(rowFor(line, 'alpha').flag).toBe('Express')
      expect(rowFor(line, 'gamma').flag).toBe('Local')
    })

    it('reads a change of pattern inside one line as the change it is', () => {
      // Arrive at gamma on the express, carry on to delta on the local: the
      // same railway, but not the same train.
      expect(rowFor(lineViewFor(SHARED_LINE, 'phase-1'), 'gamma').detail.transferFrom).toBe('Express')
    })

    it('keeps a genuinely separate line separate, rooted where it is boarded', () => {
      const branch = lineViewFor(SHARED_LINE, 'branch')

      expect(branch.rows.map((r) => r.slug)).toEqual([null, 'beta', 'epsilon'])
      expect(rowFor(branch, 'beta').parentKey).toBe('origin')
      expect(rowFor(branch, 'beta').flag).toBe('Spur Line')
    })

    it('falls back to a view per service for a page that cannot name the lines', () => {
      // An API too old to report which route a service runs over leaves the
      // page unable to answer, and the card degrades to what it drew before.
      expect(build(SHARED_LINE).views.map((v) => v.key))
        .toEqual(['express', 'local', 'spur'])
    })
  })

  describe('rows', () => {
    it('puts the starting location first in every view, holding the whole budget', () => {
      for (const view of build(INTERCHANGE).views) {
        expect(view.rows[0].key).toBe('origin')
        expect(view.rows[0].slug).toBeNull()
        expect(view.rows[0].remainingSecs).toBe(120 * 60)
      }
    })

    it('reads down as a countdown, most time remaining first', () => {
      expect(viewFor(INTERCHANGE, 'trunk').rows.map((r) => r.remainingSecs))
        .toEqual([7200, 6300, 5400, 4500])
    })

    it('shows station names rather than the slugs the wire carries', () => {
      expect(viewFor(INTERCHANGE, 'trunk').rows.map((r) => r.label))
        .toEqual(['Starting location', 'Alpha', 'Beta', 'Gamma'])
    })

    it('falls back to the slug for a station the page has no name for', () => {
      const { views } = buildTimeRemainingGraph(metadata(INTERCHANGE), {
        stationName: (slug) => slug,
        serviceName: (id) => id,
        mode: 'walk',
      })
      const trunk = views.find((v) => v.key === 'trunk')!

      expect(rowFor(trunk, 'alpha').label).toBe('alpha')
    })

    it('breaks a tie on time remaining by slug, so one query always draws the same', () => {
      const tied: ReachableStation[] = [
        { station_slug: 'zulu', access_mins: 5, access_secs: 300, remaining_mins: 90, remaining_secs: 5400 },
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 90, remaining_secs: 5400 },
      ]

      expect(viewFor(tied, ACCESS_VIEW_KEY).rows.map((r) => r.slug)).toEqual([null, 'alpha', 'zulu'])
    })

    it('orders on seconds, not the truncated minutes, so rounding never reorders a row', () => {
      const nearlyTied: ReachableStation[] = [
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 90, remaining_secs: 5401 },
        { station_slug: 'beta', access_mins: 5, access_secs: 300, remaining_mins: 90, remaining_secs: 5459 },
      ]

      expect(viewFor(nearlyTied, ACCESS_VIEW_KEY).rows.map((r) => r.slug)).toEqual([null, 'beta', 'alpha'])
    })

    it('falls back to whole minutes when a result carries no seconds', () => {
      const legacy: ReachableStation[] = [{ station_slug: 'alpha', access_mins: 5, remaining_mins: 90 }]

      expect(rowFor(viewFor(legacy, ACCESS_VIEW_KEY), 'alpha').remainingSecs).toBe(90 * 60)
    })

    it('subtracts the boarding wait from the station where it is paid, since the rider leaves that much later', () => {
      // Alpha is arrived at with 115 minutes left and left with 105, the ten
      // minutes between being the wait to board the trunk.
      expect(rowFor(viewFor(INTERCHANGE, 'trunk'), 'alpha').remainingSecs).toBe(6900 - 600)
      // Beta pays no wait — the change of service there is free — so what the
      // wire reported is already what the rider leaves with.
      expect(rowFor(viewFor(INTERCHANGE, 'trunk'), 'beta').remainingSecs).toBe(5400)
    })

    it('reports a station the same way in every view it appears in', () => {
      const inTrunk = rowFor(viewFor(INTERCHANGE, 'trunk'), 'beta')
      const inSpur = rowFor(viewFor(INTERCHANGE, 'spur'), 'beta')

      expect(inSpur.remainingSecs).toBe(inTrunk.remainingSecs)
      expect(inSpur.detail.dwellSecs).toBe(inTrunk.detail.dwellSecs)
      expect(inSpur.detail.rideSecs).toBe(inTrunk.detail.rideSecs)
    })
  })

  describe('lanes', () => {
    it('forks the two directions of travel off the station the rider boards at', () => {
      const trunk = viewFor(BOTH_DIRECTIONS, 'trunk')

      expect(trunk.laneCount).toBe(2)
      expect(rowFor(trunk, 'middle').forks).toEqual([0, 1])
      expect(rowFor(trunk, 'northward').lane).toBe(0)
      expect(rowFor(trunk, 'southward').lane).toBe(1)
    })

    it('draws a line that never branches in one lane', () => {
      const trunk = viewFor(INTERCHANGE, 'trunk')

      expect(trunk.laneCount).toBe(1)
      expect(trunk.rows.every((r) => r.lane === 0)).toBe(true)
    })

    it('forks before boarding when the origin reaches two stations on foot', () => {
      const twoOnFoot: ReachableStation[] = [
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
        { station_slug: 'beta', access_mins: 9, access_secs: 540, remaining_mins: 111, remaining_secs: 6660 },
      ]

      const access = viewFor(twoOnFoot, ACCESS_VIEW_KEY)
      expect(rowFor(access, 'alpha').parentKey).toBe('origin')
      expect(rowFor(access, 'beta').parentKey).toBe('origin')
      expect(access.laneCount).toBe(2)
    })

    it('reports the lanes a row forks down into and the ones passing it by', () => {
      // A trunk boarded in the middle, one direction ending immediately and the
      // other running two stops, so a reserved lane passes a row by.
      const stations: ReachableStation[] = [
        ...BOTH_DIRECTIONS,
        {
          station_slug: 'far-south',
          access_mins: 5,
          access_secs: 300,
          remaining_mins: 70,
          remaining_secs: 4200,
          predecessor_slug: 'southward',
          legs: [{ from: 'southward', to: 'far-south', service_id: 'trunk', secs: 1300 }],
        },
      ]
      const trunk = viewFor(stations, 'trunk')

      expect(rowFor(trunk, 'middle').forks).toEqual([0, 1])
      expect(rowFor(trunk, 'northward').through).toEqual([1])
      expect(rowFor(trunk, 'northward').forks).toEqual([])
      expect(rowFor(trunk, 'far-south').through).toEqual([])
    })

    it('marks every row but the starting location as arrived at from above', () => {
      const trunk = viewFor(INTERCHANGE, 'trunk')

      expect(trunk.rows[0].incoming).toBe(false)
      expect(trunk.rows.slice(1).every((r) => r.incoming)).toBe(true)
    })

    it('opens a lane per branch when the origin reaches several stations on foot', () => {
      const stations: ReachableStation[] = [
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
        { station_slug: 'beta', access_mins: 9, access_secs: 300, remaining_mins: 110, remaining_secs: 6600 },
        { station_slug: 'zulu', access_mins: 9, access_secs: 300, remaining_mins: 100, remaining_secs: 6000 },
      ]

      const access = viewFor(stations, ACCESS_VIEW_KEY)
      expect(access.laneCount).toBe(3)
      expect(access.rows.map((r) => r.lane)).toEqual([0, 0, 1, 2])
    })
  })

  describe('the service flag', () => {
    it('flags the starting location with the travel mode', () => {
      expect(build(INTERCHANGE).views[0].rows[0].flag).toBe('Walk')
    })

    it('flags the starting location as Transit when plotted in transit mode', () => {
      const graph = buildTimeRemainingGraph(metadata(INTERCHANGE), {
        stationName: (slug) => NAMES[slug] ?? slug,
        serviceName: (id) => SERVICES[id] ?? id,
        mode: 'transit',
      })
      expect(graph.views[0].rows[0].flag).toBe('Transit')
    })

    it('flags a station with the service the rider leaves it on', () => {
      const trunk = viewFor(INTERCHANGE, 'trunk')

      expect(rowFor(trunk, 'alpha').flag).toBe('Trunk Line')
      expect(rowFor(trunk, 'beta').flag).toBe('Trunk Line')
    })

    it('leaves a station at the end of a branch unflagged, because the journey stops there', () => {
      expect(rowFor(viewFor(INTERCHANGE, 'trunk'), 'gamma').flag).toBeNull()
      expect(rowFor(viewFor(INTERCHANGE, 'spur'), 'delta').flag).toBeNull()
    })

    it('flags an interchange by the line it is read on', () => {
      // Beta ends the trunk's branch and begins the spur's, so the same station
      // is a destination in one view and somewhere to get on in the next.
      expect(rowFor(viewFor(INTERCHANGE, 'trunk'), 'beta').flag).toBe('Trunk Line')
      expect(rowFor(viewFor(INTERCHANGE, 'spur'), 'beta').flag).toBe('Spur Line')
    })
  })

  describe('the expanded detail', () => {
    it('describes the access leg on the starting location', () => {
      expect(build(INTERCHANGE).views[0].rows[0].detail).toEqual({ accessSecs: 300, accessTo: 'Alpha' })
    })

    it('reports when the rider arrived, whenever that differs from when they leave', () => {
      const trunk = viewFor(INTERCHANGE, 'trunk')

      // Alpha is arrived at with the walk deducted and left ten minutes later.
      expect(rowFor(trunk, 'alpha').detail.arrivalSecs).toBe(6900)
      // Beta's arrival is its dwell earlier than its departure.
      expect(rowFor(trunk, 'beta').detail.arrivalSecs).toBe(5400 + 60)
    })

    it('reports the dwell and the ride in, with the ride excluding the dwell', () => {
      const beta = rowFor(viewFor(INTERCHANGE, 'trunk'), 'beta')

      expect(beta.detail.dwellSecs).toBe(60)
      expect(beta.detail.rideSecs).toBe(840)
    })

    it('names the service arrived on where boarding this line is a change', () => {
      // Read on the spur, beta is where the rider gets off the trunk.
      expect(rowFor(viewFor(INTERCHANGE, 'spur'), 'beta').detail.transferFrom).toBe('Trunk Line')
    })

    it('reports no change where the rider stays aboard', () => {
      const trunk = viewFor(INTERCHANGE, 'trunk')

      expect(rowFor(trunk, 'beta').detail.transferFrom).toBeUndefined()
      expect(rowFor(trunk, 'alpha').detail.transferFrom).toBeUndefined()
    })

    it('leaves out what does not apply, so a plain stop is not padded with empty lines', () => {
      expect(rowFor(viewFor(INTERCHANGE, 'trunk'), 'gamma').detail).toEqual({
        arrivalSecs: 4500 + 45,
        dwellSecs: 45,
        rideSecs: 855,
      })
    })

    it('omits the dwell and the arrival on a result plotted before dwell was reported', () => {
      const noDwell: ReachableStation[] = [
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
        {
          station_slug: 'beta',
          access_mins: 5,
          access_secs: 300,
          remaining_mins: 90,
          remaining_secs: 5400,
          predecessor_slug: 'alpha',
          legs: [{ from: 'alpha', to: 'beta', service_id: 'trunk', secs: 900 }],
        },
      ]

      expect(rowFor(viewFor(noDwell, 'trunk'), 'beta').detail).toEqual({ rideSecs: 900 })
    })
  })
})

describe('formatTimeRemaining', () => {
  it('drops the hours below an hour', () => {
    expect(formatTimeRemaining(1800)).toBe('30m')
    expect(formatTimeRemaining(59)).toBe('0m')
  })

  it('reads as hours and minutes above one', () => {
    expect(formatTimeRemaining(5400)).toBe('1h 30m')
    expect(formatTimeRemaining(7200)).toBe('2h 0m')
  })

  it('never reports a negative time', () => {
    expect(formatTimeRemaining(-60)).toBe('0m')
  })
})

describe('remainingSecsBySlug', () => {
  it('returns nothing when the graph has no stations', () => {
    const lookup = remainingSecsBySlug({ views: [] })
    expect(lookup('alpha')).toBeNull()
  })

  it('looks up departure remaining for a station the graph reached', () => {
    const lookup = remainingSecsBySlug(build(INTERCHANGE))
    expect(lookup('alpha')).toBe(rowFor(viewFor(INTERCHANGE, 'trunk'), 'alpha').remainingSecs)
    expect(lookup('beta')).toBe(rowFor(viewFor(INTERCHANGE, 'trunk'), 'beta').remainingSecs)
  })

  it('returns nothing for a station that is not in the graph', () => {
    expect(remainingSecsBySlug(build(INTERCHANGE))('nowhere')).toBeNull()
  })

  it('skips the starting location, which has no slug to hang a map popup on', () => {
    const graph = build(INTERCHANGE)
    expect(graph.views[0].rows[0].slug).toBeNull()
    expect(remainingSecsBySlug(graph)('origin')).toBeNull()
  })
})

describe('formatDuration', () => {
  it('keeps the seconds below a minute, since a dwell is often shorter than one', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(0)).toBe('0s')
  })

  it('reads as minutes above one, and as hours and minutes above sixty', () => {
    expect(formatDuration(840)).toBe('14m')
    expect(formatDuration(3900)).toBe('1h 5m')
  })
})

describe('shortLineName', () => {
  it('keeps the part that names the line and drops the part that says where it runs', () => {
    expect(shortLineName('CA HSR Phase 1 — San Francisco to Anaheim')).toBe('CA HSR Phase 1')
    expect(shortLineName('Brightline West — Palmdale to Las Vegas')).toBe('Brightline West')
  })

  it('leaves a name that is already only a name alone', () => {
    expect(shortLineName('Brightline West')).toBe('Brightline West')
  })

  it('keeps a hyphen that is part of a word rather than a separator', () => {
    expect(shortLineName('Trans-Bay Link')).toBe('Trans-Bay Link')
  })

  it('would rather give back the whole name than nothing at all', () => {
    expect(shortLineName('— Palmdale to Las Vegas')).toBe('— Palmdale to Las Vegas')
  })
})

describe('laneWidthFor', () => {
  it('gives a shallow graph its full lane width', () => {
    expect(laneWidthFor(1)).toBe(MAX_LANE_PX)
    expect(laneWidthFor(2)).toBe(MAX_LANE_PX)
  })

  it('narrows the lanes as they multiply rather than crowding out the names', () => {
    expect(laneWidthFor(6)).toBeLessThan(MAX_LANE_PX)
    expect(laneWidthFor(6) * 6).toBeLessThanOrEqual(GRAPH_COLUMN_PX)
  })

  it('stops narrowing at a legible floor, past which the names give up the room', () => {
    expect(laneWidthFor(40)).toBe(MIN_LANE_PX)
    expect(laneWidthFor(40) * 40).toBeGreaterThan(GRAPH_COLUMN_PX)
  })
})

describe('buildTimeRemainingGraph trip progress', () => {
  const PROGRESS: NonNullable<ChainMetadata['trip_progress']> = [
    {
      from: 'gamma',
      to: 'epsilon',
      service_id: 'trunk',
      route_id: 'rt-trunk',
      from_chainage_m: 10000,
      to_chainage_m: 25000,
      fraction: 0.35,
      remaining_secs: 300,
      ride_secs: 855,
    },
  ]

  function buildWithProgress(
    stations: ReachableStation[],
    progress: NonNullable<ChainMetadata['trip_progress']>,
  ) {
    return buildTimeRemainingGraph(
      { ...metadata(stations), trip_progress: progress },
      {
        stationName: (slug) => NAMES[slug] ?? slug,
        serviceName: (id) => SERVICES[id] ?? id,
        mode: 'walk',
      },
    )
  }

  function trunkRow(progress: NonNullable<ChainMetadata['trip_progress']>, slug: string) {
    const view = buildWithProgress(INTERCHANGE, progress).views.find((v) => v.key === 'trunk')
    if (!view) throw new Error('no trunk view')
    return rowFor(view, slug)
  }

  it("says how far past a branch's last station the rider got, and toward where", () => {
    // The station headed toward is named, not slugged: it goes in front of a
    // reader, and it is a station the trip never lists, so nothing else would
    // resolve it.
    const gamma = trunkRow(PROGRESS, 'gamma')
    expect(gamma.detail.progressTo).toBe('Epsilon')
    expect(gamma.detail.progressFraction).toBe(0.35)
  })

  // The card and the map read the same number from the same field, so there is
  // never a question of which surface to believe.
  it('reports the fraction the wire gave it, unrounded', () => {
    const odd = [{ ...PROGRESS[0], fraction: 0.9114 }]
    expect(trunkRow(odd, 'gamma').detail.progressFraction).toBe(0.9114)
  })

  it('leaves every other row alone', () => {
    const view = buildWithProgress(INTERCHANGE, PROGRESS).views.find((v) => v.key === 'trunk')
    if (!view) throw new Error('no trunk view')
    for (const row of view.rows) {
      if (row.slug === 'gamma') continue
      expect(row.detail.progressTo).toBeUndefined()
      expect(row.detail.progressFraction).toBeUndefined()
    }
  })

  it('is exactly what it is today when the plot carries no progress', () => {
    expect(buildWithProgress(INTERCHANGE, [])).toEqual(build(INTERCHANGE))
    expect(
      buildTimeRemainingGraph(metadata(INTERCHANGE), {
        stationName: (slug) => NAMES[slug] ?? slug,
        serviceName: (id) => SERVICES[id] ?? id,
        mode: 'walk',
      }),
    ).toEqual(build(INTERCHANGE))
  })

  it('leaves row order, lanes and connectors exactly as they were', () => {
    const geometry = (graph: ReturnType<typeof build>) =>
      graph.views.map((view) => ({
        key: view.key,
        laneCount: view.laneCount,
        rows: view.rows.map((r) => ({
          key: r.key,
          parentKey: r.parentKey,
          lane: r.lane,
          through: r.through,
          forks: r.forks,
          incoming: r.incoming,
          flag: r.flag,
        })),
      }))

    expect(geometry(buildWithProgress(INTERCHANGE, PROGRESS))).toEqual(geometry(build(INTERCHANGE)))
  })

  it('ignores an entry whose station is not in the trip at all', () => {
    const orphan = [{ ...PROGRESS[0], from: 'nowhere' }]
    const view = buildWithProgress(INTERCHANGE, orphan).views.find((v) => v.key === 'trunk')
    if (!view) throw new Error('no trunk view')
    for (const row of view.rows) expect(row.detail.progressTo).toBeUndefined()
  })

  // A station both of whose onward branches run out of budget has two entries.
  // The row carries the one that got furthest, which is the branch a reader is
  // being told about when the card says how close they came; ties go to the
  // lower station slug so the same trip always reads the same way.
  it('reports the furthest of several unfinished branches off one station', () => {
    const forked = [
      { ...PROGRESS[0], from: 'beta', to: 'zeta', fraction: 0.2 },
      { ...PROGRESS[0], from: 'beta', to: 'omega', fraction: 0.8 },
    ]
    const beta = trunkRow(forked, 'beta')
    expect(beta.detail.progressTo).toBe('omega')
    expect(beta.detail.progressFraction).toBe(0.8)
  })

  // A station reached on one line and boarded on another appears in both views.
  // The unfinished leg belongs to the view of the line its own hop runs over —
  // beta is where the rider boards the spur, and the trunk view carries on past
  // beta to gamma, so announcing spur progress under the trunk's beta row would
  // put it under a row that is not the end of that branch and name a station on
  // a different line.
  it('reports an unfinished leg only in the view of the line it runs over', () => {
    const onTheSpur = [{ ...PROGRESS[0], from: 'beta', to: 'zeta', service_id: 'spur' }]
    const views = buildWithProgress(INTERCHANGE, onTheSpur).views

    const trunk = views.find((v) => v.key === 'trunk')
    if (!trunk) throw new Error('no trunk view')
    expect(rowFor(trunk, 'beta').detail.progressTo).toBeUndefined()

    const spur = views.find((v) => v.key === 'spur')
    if (!spur) throw new Error('no spur view')
    expect(rowFor(spur, 'beta').detail.progressTo).toBe('zeta')
  })

  // "I boarded and barely moved": the only unfinished leg is the first ride, so
  // nothing on that line was ever reached and it has no view of its own. The
  // fact still has to reach the reader, so it falls back to whichever view holds
  // the station the rider left from.
  it('still reports a leg whose line has no view of its own', () => {
    const unreachedLine = [{ ...PROGRESS[0], from: 'beta', to: 'zeta', service_id: 'unbuilt' }]
    const trunk = buildWithProgress(INTERCHANGE, unreachedLine).views.find((v) => v.key === 'trunk')
    if (!trunk) throw new Error('no trunk view')
    expect(rowFor(trunk, 'beta').detail.progressTo).toBe('zeta')
  })
})

describe('formatProgressPercent', () => {
  it('reports the whole percent for an ordinary fraction', () => {
    expect(formatProgressPercent(0.35)).toBe('35%')
    expect(formatProgressPercent(0.9109)).toBe('91%')
  })

  // A fraction of 1 is the band where the remaining time covers the ride but
  // not the dwell. The station stays unlit and gets no polygon, so "100% of the
  // way toward Millbrae" beside an unlit Millbrae is the one thing this must
  // never say.
  it('never reads as an arrival, because a fraction of one is not one', () => {
    expect(formatProgressPercent(1)).toBe('99%')
    expect(formatProgressPercent(0.996)).toBe('99%')
  })

  // There is deliberately no floor on the fraction itself — a barely-moved stub
  // is drawn rather than suppressed — so rounding it away in words while the map
  // still draws the line would undo that.
  it('never reads as no progress at all, because the map is drawing a stub', () => {
    expect(formatProgressPercent(0.001)).toBe('1%')
    expect(formatProgressPercent(0.004)).toBe('1%')
  })
})
