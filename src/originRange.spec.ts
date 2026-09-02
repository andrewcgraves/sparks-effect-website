// @vitest-environment node
// No DOM in this file. See the environment note in vite.config.ts.

import { describe, expect, it } from 'vitest'
import {
  ORIGIN_OUT_OF_RANGE_CODE,
  checkOriginReach,
  haversineKm,
  outOfRangeError,
  outOfRangeMessage,
  reachKm,
} from './originRange'
import { ApiError } from './api/authoring/client'
import type { Station } from './api/scenarios'

const ORIGIN = { lat: 37.7, lng: -122.4 }
// A degree of latitude, in km. Going north rather than east keeps the
// conversion exact at any latitude.
const KM_PER_DEG_LAT = 111.194926644559

function stationAt(km: number, name = 'Somewhere'): Station {
  return {
    id: name,
    scenario_id: '',
    slug: name.toLowerCase(),
    name,
    location: { type: 'Point', coordinates: [ORIGIN.lng, ORIGIN.lat + km / KM_PER_DEG_LAT] },
    platform_height: '',
  }
}

describe('haversineKm', () => {
  it('is zero for a point against itself', () => {
    expect(haversineKm(37.7, -122.4, 37.7, -122.4)).toBe(0)
  })

  // A radians/degrees slip is the mistake this function is prone to, and it
  // would put every range check out by a constant factor.
  it('makes one degree of latitude ~111.19 km', () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1)
  })

  it('shrinks a degree of longitude with the cosine of the latitude', () => {
    expect(haversineKm(60, 0, 60, 1)).toBeCloseTo(haversineKm(0, 0, 0, 1) / 2, 1)
  })
})

describe('reachKm', () => {
  // The table the whole check is calibrated against, asserted as literals
  // rather than recomputed — a test that restates the formula would agree with
  // any change to it.
  it.each([
    ['walk', 30, 2.5],
    ['walk', 60, 5],
    ['walk', 120, 10],
    ['walk', 240, 20],
    ['bike', 30, 7.5],
    ['bike', 240, 60],
    ['drive', 30, 40],
    ['drive', 240, 320],
  ] as const)('covers %s for %i minutes', (mode, mins, want) => {
    expect(reachKm(mode, mins)).toBeCloseTo(want, 9)
  })

  it('reaches nowhere on a non-positive budget', () => {
    expect(reachKm('walk', 0)).toBe(0)
    expect(reachKm('walk', -30)).toBe(0)
  })
})

describe('checkOriginReach', () => {
  it('puts a station just inside the radius in range', () => {
    const reach = checkOriginReach([stationAt(2.4)], ORIGIN, 'walk', 30)
    expect(reach?.inRange).toBe(true)
    expect(reach?.maxReachKm).toBeCloseTo(2.5, 9)
  })

  it('puts a station just outside the radius out of range', () => {
    const reach = checkOriginReach([stationAt(2.6)], ORIGIN, 'walk', 30)
    expect(reach?.inRange).toBe(false)
  })

  // Refusing a station reachable in exactly the budget would refuse a request
  // that works.
  it('treats a station exactly at the limit as in range', () => {
    expect(checkOriginReach([stationAt(2.5)], ORIGIN, 'walk', 30)?.inRange).toBe(true)
  })

  it('measures against the nearest station, not the first', () => {
    const reach = checkOriginReach(
      [stationAt(50, 'Far'), stationAt(1, 'Near'), stationAt(10, 'Middling')],
      ORIGIN,
      'walk',
      30,
    )
    expect(reach?.inRange).toBe(true)
    expect(reach?.nearestName).toBe('Near')
  })

  it('still names the nearest station when out of range', () => {
    const reach = checkOriginReach([stationAt(200, 'Far'), stationAt(100, 'Closest')], ORIGIN, 'walk', 30)
    expect(reach?.inRange).toBe(false)
    expect(reach?.nearestName).toBe('Closest')
    expect(reach?.nearestKm).toBeCloseTo(100, 0)
  })

  // The same origin and stations, in a mode that covers the distance. Without
  // this, a check that refused everything would pass the tests above.
  it('lets a mode that covers the distance through', () => {
    const stations = [stationAt(100)]
    expect(checkOriginReach(stations, ORIGIN, 'walk', 30)?.inRange).toBe(false)
    expect(checkOriginReach(stations, ORIGIN, 'drive', 120)?.inRange).toBe(true)
  })

  // A page that has not loaded its scenario knows nothing about how far the
  // origin is, and must not refuse on that basis.
  it('declines to answer with no stations', () => {
    expect(checkOriginReach([], ORIGIN, 'walk', 30)).toBeNull()
  })
})

describe('outOfRangeMessage', () => {
  it('names the distance, the budget and both ways out', () => {
    const msg = outOfRangeMessage({ nearestKm: 111.2, maxReachKm: 2.5 }, 'walk', 30)
    expect(msg).toContain('111 km')
    expect(msg).toContain('30-minute walk')
    expect(msg).toContain('2.5 km')
    expect(msg).toMatch(/travel time/)
  })

  it('says metres for a station under a kilometre away', () => {
    expect(outOfRangeMessage({ nearestKm: 0.82, maxReachKm: 0.5 }, 'walk', 6)).toContain('820 m')
  })

  it('uses the verb that goes with the mode', () => {
    expect(outOfRangeMessage({ nearestKm: 100, maxReachKm: 15 }, 'bike', 60)).toContain('60-minute ride')
    expect(outOfRangeMessage({ nearestKm: 500, maxReachKm: 160 }, 'drive', 120)).toContain('120-minute drive')
  })
})

describe('outOfRangeError', () => {
  function apiRefusal(detail: unknown): ApiError {
    return new ApiError('too far', 422, ORIGIN_OUT_OF_RANGE_CODE, detail)
  }

  it('reads the server distances into a message', () => {
    const msg = outOfRangeError(apiRefusal({ nearest_station_km: 111.2, max_reach_km: 2.5 }), 'walk', 30)
    expect(msg).toContain('111 km')
    expect(msg).toContain('2.5 km')
  })

  // Anything that is not this refusal leaves the caller on its own fallback,
  // which beats inventing a distance.
  it.each([
    ['a different code', new ApiError('stale', 409, 'stale_graph')],
    ['no code at all', new ApiError('nope', 500)],
    ['not an ApiError', new Error('network down')],
    ['nothing', null],
  ])('returns null for %s', (_name, err) => {
    expect(outOfRangeError(err, 'walk', 30)).toBeNull()
  })

  // The code is right but the payload is not readable: the server's prose is
  // still better than a generic failure, so it is used as-is.
  it.each([
    ['no detail', null],
    ['detail missing its numbers', {}],
    ['detail with the wrong types', { nearest_station_km: '111', max_reach_km: '2.5' }],
  ])('falls back to the server message with %s', (_name, detail) => {
    expect(outOfRangeError(apiRefusal(detail), 'walk', 30)).toBe('too far')
  })
})
