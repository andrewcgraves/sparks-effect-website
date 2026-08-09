import { describe, it, expect } from 'vitest'
import {
  buildTimeRemainingGraph,
  formatDuration,
  formatTimeRemaining,
  laneWidthFor,
  MAX_LANE_PX,
  MIN_LANE_PX,
  GRAPH_COLUMN_PX,
} from './timeRemaining'
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

// alpha --trunk--> beta --trunk--> gamma
//                    \--spur--> delta
//
// A 120-minute budget, a 5-minute walk to alpha, a 10-minute wait to board the
// trunk, then 15 minutes to beta, 15 more to gamma, or 10 from beta to delta.
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

const NAMES = { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta' }
const SERVICES = { trunk: 'Trunk Line', spur: 'Spur Line' }

function build(stations: ReachableStation[], budgetMins = 120) {
  return buildTimeRemainingGraph(metadata(stations, budgetMins), {
    stationName: (slug) => NAMES[slug as keyof typeof NAMES] ?? slug,
    serviceName: (id) => SERVICES[id as keyof typeof SERVICES] ?? id,
    mode: 'walk',
  })
}

function rowFor(rows: ReturnType<typeof build>['rows'], slug: string) {
  const row = rows.find((r) => r.slug === slug)
  if (!row) throw new Error(`no row for ${slug}`)
  return row
}

describe('buildTimeRemainingGraph', () => {
  it('puts the starting location first, holding the whole travel-time budget', () => {
    const { rows } = build(INTERCHANGE)

    expect(rows[0].key).toBe('origin')
    expect(rows[0].slug).toBeNull()
    expect(rows[0].remainingSecs).toBe(120 * 60)
  })

  it('lists every reachable station, most time remaining first', () => {
    const { rows } = build(INTERCHANGE)

    expect(rows.map((r) => r.slug)).toEqual([null, 'alpha', 'beta', 'delta', 'gamma'])
  })

  it('shows station names rather than the slugs the wire carries', () => {
    const { rows } = build(INTERCHANGE)

    expect(rows.map((r) => r.label)).toEqual(['Starting location', 'Alpha', 'Beta', 'Delta', 'Gamma'])
  })

  it('falls back to the slug for a station the page has no name for', () => {
    const { rows } = buildTimeRemainingGraph(metadata(INTERCHANGE), {
      stationName: (slug) => slug,
      serviceName: (id) => id,
      mode: 'walk',
    })

    expect(rowFor(rows, 'alpha').label).toBe('alpha')
  })

  it('breaks a tie on time remaining by slug, so one query always draws the same', () => {
    const tied: ReachableStation[] = [
      { station_slug: 'zulu', access_mins: 5, access_secs: 300, remaining_mins: 90, remaining_secs: 5400 },
      { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 90, remaining_secs: 5400 },
    ]

    expect(build(tied).rows.map((r) => r.slug)).toEqual([null, 'alpha', 'zulu'])
  })

  it('orders on seconds, not the truncated minutes, so rounding never reorders a row', () => {
    const nearlyTied: ReachableStation[] = [
      { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 90, remaining_secs: 5401 },
      { station_slug: 'beta', access_mins: 5, access_secs: 300, remaining_mins: 90, remaining_secs: 5459 },
    ]

    expect(build(nearlyTied).rows.map((r) => r.slug)).toEqual([null, 'beta', 'alpha'])
  })

  it('falls back to whole minutes when a result carries no seconds', () => {
    const legacy: ReachableStation[] = [
      { station_slug: 'alpha', access_mins: 5, remaining_mins: 90 },
    ]

    expect(rowFor(build(legacy).rows, 'alpha').remainingSecs).toBe(90 * 60)
  })

  it('subtracts the boarding wait from the station where it is paid, since the rider leaves that much later', () => {
    const { rows } = build(INTERCHANGE)

    // Alpha is arrived at with 115 minutes left and left with 105, the ten
    // minutes between being the wait to board the trunk.
    expect(rowFor(rows, 'alpha').remainingSecs).toBe(6900 - 600)
    // Beta pays no wait — the change of service there is free — so what the
    // wire reported is already what the rider leaves with.
    expect(rowFor(rows, 'beta').remainingSecs).toBe(5400)
  })

  describe('the tree', () => {
    it('roots every station the rider walked to at the starting location', () => {
      const { rows } = build(INTERCHANGE)

      expect(rowFor(rows, 'alpha').parentKey).toBe('origin')
    })

    it('hangs a station off the one it was ridden from', () => {
      const { rows } = build(INTERCHANGE)

      expect(rowFor(rows, 'beta').parentKey).toBe('alpha')
      expect(rowFor(rows, 'delta').parentKey).toBe('beta')
      expect(rowFor(rows, 'gamma').parentKey).toBe('beta')
    })

    it('roots a station whose predecessor was not itself reported', () => {
      const orphaned: ReachableStation[] = [
        {
          station_slug: 'beta',
          access_mins: 5,
          access_secs: 300,
          remaining_mins: 90,
          remaining_secs: 5400,
          predecessor_slug: 'not-reported',
        },
      ]

      expect(rowFor(build(orphaned).rows, 'beta').parentKey).toBe('origin')
    })

    it('forks before boarding when the origin reaches two stations on foot', () => {
      const twoOnFoot: ReachableStation[] = [
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
        { station_slug: 'beta', access_mins: 9, access_secs: 540, remaining_mins: 111, remaining_secs: 6660 },
      ]

      const { rows, laneCount } = build(twoOnFoot)
      expect(rowFor(rows, 'alpha').parentKey).toBe('origin')
      expect(rowFor(rows, 'beta').parentKey).toBe('origin')
      expect(laneCount).toBe(2)
    })

    it('draws a single origin and station as a two-row graph in one lane', () => {
      const lone: ReachableStation[] = [
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
      ]

      const { rows, laneCount } = build(lone)
      expect(rows).toHaveLength(2)
      expect(laneCount).toBe(1)
      expect(rows.every((r) => r.lane === 0)).toBe(true)
    })

    it('yields nothing at all when there is no result to draw', () => {
      expect(buildTimeRemainingGraph(null, {
        stationName: (s) => s,
        serviceName: (s) => s,
        mode: 'walk',
      }).rows).toEqual([])
    })
  })

  describe('lanes', () => {
    it('keeps a branch that ends in one lane and opens a second for the fork', () => {
      const { rows, laneCount } = build(INTERCHANGE)

      expect(rowFor(rows, 'alpha').lane).toBe(0)
      expect(rowFor(rows, 'beta').lane).toBe(0)
      // Beta forks: delta continues beta's lane, gamma opens a new one.
      expect(rowFor(rows, 'delta').lane).toBe(0)
      expect(rowFor(rows, 'gamma').lane).toBe(1)
      expect(laneCount).toBe(2)
    })

    it('reports the lanes a row forks down into and the ones passing it by', () => {
      const { rows } = build(INTERCHANGE)

      // Beta is where the graph splits, so it opens both its children's lanes.
      expect(rowFor(rows, 'beta').forks).toEqual([0, 1])
      // Delta sits between beta and gamma with gamma's lane reserved past it.
      expect(rowFor(rows, 'delta').through).toEqual([1])
      expect(rowFor(rows, 'delta').forks).toEqual([])
      // Gamma ends its branch and passes nothing on.
      expect(rowFor(rows, 'gamma').through).toEqual([])
    })

    it('marks every row but the starting location as arrived at from above', () => {
      const { rows } = build(INTERCHANGE)

      expect(rows[0].incoming).toBe(false)
      expect(rows.slice(1).every((r) => r.incoming)).toBe(true)
    })

    it('reuses a lane freed by a branch that ended', () => {
      // Two stations reached on foot. Alpha goes nowhere, so its lane comes
      // free; beta's second branch takes it back rather than opening a third.
      const stations: ReachableStation[] = [
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
        { station_slug: 'beta', access_mins: 9, access_secs: 300, remaining_mins: 110, remaining_secs: 6600 },
        {
          station_slug: 'gamma',
          access_mins: 9,
          access_secs: 300,
          remaining_mins: 80,
          remaining_secs: 4800,
          predecessor_slug: 'beta',
          legs: [{ from: 'beta', to: 'gamma', secs: 1800 }],
        },
        {
          station_slug: 'delta',
          access_mins: 9,
          access_secs: 300,
          remaining_mins: 70,
          remaining_secs: 4200,
          predecessor_slug: 'beta',
          legs: [{ from: 'beta', to: 'delta', secs: 2400 }],
        },
      ]

      const { rows, laneCount } = build(stations)
      expect(laneCount).toBe(2)
      expect(rowFor(rows, 'alpha').lane).toBe(0)
      expect(rowFor(rows, 'beta').lane).toBe(1)
      expect(rowFor(rows, 'delta').lane).toBe(0)
    })
  })

  describe('the service flag', () => {
    it('flags the starting location with the travel mode', () => {
      expect(build(INTERCHANGE).rows[0].flag).toBe('Walk')
    })

    it('flags a station with the service the rider leaves it on', () => {
      const { rows } = build(INTERCHANGE)

      expect(rowFor(rows, 'alpha').flag).toBe('Trunk Line')
      // Beta forks onto both services. Staying aboard is what the flag names,
      // so a fork does not read as a change the rider is not obliged to make.
      expect(rowFor(rows, 'beta').flag).toBe('Trunk Line')
    })

    it('flags a fork by the service the rider stays aboard, whichever branch sorts first', () => {
      // Delta, on the spur, has more time left than gamma and so is drawn
      // first — but beta is still a station the rider can ride straight
      // through on the trunk.
      const { rows } = build(INTERCHANGE)

      expect(rows.map((r) => r.slug)).toEqual([null, 'alpha', 'beta', 'delta', 'gamma'])
      expect(rowFor(rows, 'beta').flag).toBe('Trunk Line')
    })

    it('leaves a station at the end of a branch unflagged, because the journey stops there', () => {
      const { rows } = build(INTERCHANGE)

      expect(rowFor(rows, 'gamma').flag).toBeNull()
      expect(rowFor(rows, 'delta').flag).toBeNull()
    })
  })

  describe('the expanded detail', () => {
    it('describes the access leg on the starting location', () => {
      const { rows } = build(INTERCHANGE)

      expect(rows[0].detail).toEqual({ accessSecs: 300, accessTo: 'Alpha' })
    })

    it('reports when the rider arrived, whenever that differs from when they leave', () => {
      const { rows } = build(INTERCHANGE)

      // Alpha is arrived at with the walk deducted and left ten minutes later.
      expect(rowFor(rows, 'alpha').detail.arrivalSecs).toBe(6900)
      // Beta's arrival is its dwell earlier than its departure.
      expect(rowFor(rows, 'beta').detail.arrivalSecs).toBe(5400 + 60)
    })

    it('reports the dwell and the ride in, with the ride excluding the dwell', () => {
      const { rows } = build(INTERCHANGE)

      expect(rowFor(rows, 'beta').detail.dwellSecs).toBe(60)
      expect(rowFor(rows, 'beta').detail.rideSecs).toBe(840)
    })

    it('names the service arrived on where every way onward requires a change', () => {
      // A trunk into the junction and only a spur out of it: the rider cannot
      // stay aboard, so this really is an interchange.
      const interchangeOnly: ReachableStation[] = [
        { station_slug: 'alpha', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
        {
          station_slug: 'beta',
          access_mins: 5,
          access_secs: 300,
          remaining_mins: 90,
          remaining_secs: 5400,
          predecessor_slug: 'alpha',
          legs: [{ from: 'alpha', to: 'beta', service_id: 'trunk', secs: 900, dwell_s: 60 }],
        },
        {
          station_slug: 'delta',
          access_mins: 5,
          access_secs: 300,
          remaining_mins: 80,
          remaining_secs: 4800,
          predecessor_slug: 'beta',
          legs: [
            { from: 'alpha', to: 'beta', service_id: 'trunk', secs: 900, dwell_s: 60 },
            { from: 'beta', to: 'delta', service_id: 'spur', secs: 600, dwell_s: 30 },
          ],
        },
      ]

      const { rows } = build(interchangeOnly)
      expect(rowFor(rows, 'beta').detail.transferFrom).toBe('Trunk Line')
      expect(rowFor(rows, 'beta').flag).toBe('Spur Line')
    })

    it('reports no change where the rider can stay aboard, even at a fork', () => {
      const { rows } = build(INTERCHANGE)

      expect(rowFor(rows, 'beta').detail.transferFrom).toBeUndefined()
      expect(rowFor(rows, 'alpha').detail.transferFrom).toBeUndefined()
    })

    it('leaves out what does not apply, so a plain stop is not padded with empty lines', () => {
      const { rows } = build(INTERCHANGE)

      expect(rowFor(rows, 'gamma').detail).toEqual({
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

      expect(rowFor(build(noDwell).rows, 'beta').detail).toEqual({ rideSecs: 900 })
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

describe('laneWidthFor', () => {
  it('gives a shallow graph its full lane width', () => {
    expect(laneWidthFor(1)).toBe(MAX_LANE_PX)
    expect(laneWidthFor(2)).toBe(MAX_LANE_PX)
  })

  it('narrows the lanes as they multiply rather than crowding out the names', () => {
    expect(laneWidthFor(6)).toBeLessThan(MAX_LANE_PX)
    expect(laneWidthFor(6) * 6).toBeLessThanOrEqual(GRAPH_COLUMN_PX)
  })

  it('stops narrowing at a legible floor, past which the column scrolls instead', () => {
    expect(laneWidthFor(40)).toBe(MIN_LANE_PX)
    expect(laneWidthFor(40) * 40).toBeGreaterThan(GRAPH_COLUMN_PX)
  })
})
