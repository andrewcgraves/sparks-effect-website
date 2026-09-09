// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './authoring/client'
import { IsochroneApiError } from './isochrone'
import { JobFailedError } from './polling'
import type { Station } from './scenarios'

vi.mock('../analytics/index', () => ({
  trackIsochroneRequest: vi.fn(),
  trackIsochroneError: vi.fn(),
}))

import { trackIsochroneError, trackIsochroneRequest } from '../analytics/index'
import { isochroneFault, isochroneRangeRefusal, isochroneRequested } from './isochroneFault'

const ORIGIN = { lat: 37.3382, lng: -121.8863 }

const sanFrancisco: Station = {
  id: 'st1',
  scenario_id: 's1',
  slug: 'sf',
  name: 'San Francisco',
  location: { type: 'Point', coordinates: [-122.4, 37.7] },
  platform_height: '0',
}

const GENERIC = 'Failed to generate isochrone. Please try again.'

function wrap(cause: unknown, status = 422): IsochroneApiError {
  return new IsochroneApiError(status, { cause })
}

describe('isochroneFault', () => {
  beforeEach(() => {
    vi.mocked(trackIsochroneRequest).mockClear()
    vi.mocked(trackIsochroneError).mockClear()
  })

  it('shows the API error text for a failed routing job', () => {
    const message = isochroneFault(
      new JobFailedError(
        'rj1',
        "The isochrone service isn't responding right now. Please try again in a few minutes.",
      ),
      'walk',
      30,
    )
    expect(message).toBe(
      "The isochrone service isn't responding right now. Please try again in a few minutes.",
    )
  })

  it('falls back when a failed routing job gave no reason', () => {
    expect(isochroneFault(new JobFailedError('rj1', ''), 'walk', 30)).toBe(GENERIC)
  })

  it('still shows the job reason when the failure is wrapped as an IsochroneApiError', () => {
    const message = isochroneFault(
      wrap(
        new JobFailedError(
          'rj1',
          "The isochrone service isn't responding right now. Please try again in a few minutes.",
        ),
        500,
      ),
      'walk',
      30,
    )
    expect(message).toBe(
      "The isochrone service isn't responding right now. Please try again in a few minutes.",
    )
  })

  it('reports an origin_out_of_range ApiError in its own terms', () => {
    const message = isochroneFault(
      new ApiError('too far', 422, 'origin_out_of_range', {
        nearest_station_km: 111.2,
        max_reach_km: 2.5,
      }),
      'walk',
      30,
    )
    expect(message).toContain('111 km')
    expect(message).not.toContain('try again')
  })

  it('unwraps IsochroneApiError to read the same origin_out_of_range refusal', () => {
    const message = isochroneFault(
      wrap(
        new ApiError('too far', 422, 'origin_out_of_range', {
          nearest_station_km: 60.6,
          max_reach_km: 2.5,
        }),
      ),
      'walk',
      30,
    )
    expect(message).toContain('61 km')
    expect(message).not.toContain('try again')
  })

  it('says the service is busy for a backlog_full refusal', () => {
    const message = isochroneFault(new ApiError('busy', 429, 'backlog_full'), 'walk', 30)
    expect(message).toMatch(/busy/i)
    expect(message).not.toBe(GENERIC)
  })

  it('unwraps IsochroneApiError to read backlog_full the same way', () => {
    const message = isochroneFault(wrap(new ApiError('busy', 429, 'backlog_full'), 429), 'walk', 30)
    expect(message).toMatch(/busy/i)
  })

  it('falls back for an unclassified failure', () => {
    expect(isochroneFault(new ApiError('boom', 500), 'walk', 30)).toBe(GENERIC)
    expect(isochroneFault(new IsochroneApiError(500), 'walk', 30)).toBe(GENERIC)
    expect(isochroneFault(new Error('network down'), 'walk', 30)).toBe(GENERIC)
  })

  it('counts an API failure with its HTTP status', () => {
    isochroneFault(new IsochroneApiError(503), 'walk', 30)
    expect(trackIsochroneError).toHaveBeenCalledWith('walk', 30, 503)
  })

  it('counts an authored ApiError with its HTTP status', () => {
    isochroneFault(new ApiError('boom', 500), 'transit', 45)
    expect(trackIsochroneError).toHaveBeenCalledWith('transit', 45, 500)
  })

  it('counts a network failure with a null status', () => {
    isochroneFault(new Error('offline'), 'walk', 30)
    expect(trackIsochroneError).toHaveBeenCalledWith('walk', 30, null)
  })

  it('counts a failed routing job with a null status', () => {
    isochroneFault(new JobFailedError('rj1', 'down'), 'walk', 30)
    expect(trackIsochroneError).toHaveBeenCalledWith('walk', 30, null)
  })
})

describe('isochroneRangeRefusal', () => {
  beforeEach(() => {
    vi.mocked(trackIsochroneRequest).mockClear()
    vi.mocked(trackIsochroneError).mockClear()
  })

  it('refuses an origin no station can reach, and counts it as an error', () => {
    const message = isochroneRangeRefusal([sanFrancisco], ORIGIN, 'walk', 30)
    expect(message).toContain('nearest station')
    expect(trackIsochroneError).toHaveBeenCalledWith('walk', 30, null)
    expect(trackIsochroneRequest).not.toHaveBeenCalled()
  })

  it('returns null when a station is within reach', () => {
    expect(isochroneRangeRefusal([sanFrancisco], { lat: 37.71, lng: -122.41 }, 'walk', 30)).toBeNull()
    expect(trackIsochroneError).not.toHaveBeenCalled()
  })

  it('returns null when there are no stations to measure against', () => {
    expect(isochroneRangeRefusal([], ORIGIN, 'walk', 30)).toBeNull()
    expect(trackIsochroneError).not.toHaveBeenCalled()
  })
})

describe('isochroneRequested', () => {
  beforeEach(() => {
    vi.mocked(trackIsochroneRequest).mockClear()
  })

  it('counts the attempt with mode and budget', () => {
    isochroneRequested('bike', 20)
    expect(trackIsochroneRequest).toHaveBeenCalledWith('bike', 20)
  })
})
