// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './authoring/client'
import { JobFailedError, JobTimedOutError } from './polling'
import { RoutingBusyError } from './routingJobs'
import type { Station } from './scenarios'

vi.mock('../analytics/index', () => ({
  trackIsochroneRequest: vi.fn(),
  trackIsochroneError: vi.fn(),
}))

import { trackIsochroneError, trackIsochroneRequest } from '../analytics/index'
import { isochroneFault, isochroneRangeRefusal, isochroneRequested, isochroneWaitMessage } from './isochroneFault'

const ORIGIN = { lat: 37.3382, lng: -121.8863 }

const sanFrancisco: Station = {
  id: 'st1',
  scenario_id: 's1',
  slug: 'sf',
  name: 'San Francisco',
  location: { type: 'Point', coordinates: [-122.4, 37.7] },
  platform_height: '0',
}

const GENERIC = "Couldn't plot this travel zone. Please try again."
const ROUTING_FAILED =
  "Routing couldn't finish this travel zone. Please try again, or try a different starting point."
const BUSY = 'Lots of people are plotting travel zones right now. Please try again in a few minutes.'

describe('isochroneFault', () => {
  beforeEach(() => {
    vi.mocked(trackIsochroneRequest).mockClear()
    vi.mocked(trackIsochroneError).mockClear()
  })

  describe('a failed routing job', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.mocked(console.warn).mockRestore()
    })

    it('says routing could not finish, and logs the job’s own reason instead of showing it', () => {
      const reason = 'compile: service "abc" references unknown route "def"'
      const message = isochroneFault(new JobFailedError('rj1', reason), 'walk', 30)
      expect(message).toBe(ROUTING_FAILED)
      expect(message).not.toMatch(/service|route|compile/i)
      expect(console.warn).toHaveBeenCalledWith('[isochrone] routing job failed:', reason)
    })

    it('says the same when the job gave no reason', () => {
      expect(isochroneFault(new JobFailedError('rj1', ''), 'walk', 30)).toBe(ROUTING_FAILED)
      expect(console.warn).toHaveBeenCalledWith('[isochrone] routing job failed:', '(no reason given)')
    })
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

  it('says the site is busy for a backlog_full refusal', () => {
    expect(isochroneFault(new ApiError('busy', 429, 'backlog_full'), 'walk', 30)).toBe(BUSY)
  })

  // SPA-467: the API says how long the backlog will take to clear, so a refused
  // visitor is told when to come back rather than "in a few minutes".
  it('quotes the Retry-After seconds when a backlog_full refusal carries them', () => {
    const refused = new ApiError('busy', 429, 'backlog_full', undefined, 30)
    expect(isochroneFault(refused, 'walk', 30)).toBe(
      'Lots of people are plotting travel zones right now. Please try again in 30 seconds.',
    )
  })

  // A bare 429 with no code could be an edge rate limiter or a proxy in front
  // of the API — a different situation, and not one this message describes.
  it('does not call a 429 without the backlog_full code busy', () => {
    expect(isochroneFault(new ApiError('busy', 429), 'walk', 30)).toBe(GENERIC)
  })

  it('says the site is busy, not that routing failed, for a job given up on in the queue', () => {
    const busy = new RoutingBusyError(new JobFailedError('rj1', 'stale'))
    expect(isochroneFault(busy, 'walk', 30)).toBe(BUSY)
    expect(isochroneFault(new RoutingBusyError(new JobTimedOutError('rj1', 120_000)), 'walk', 30)).toBe(BUSY)
  })

  it('points at the example travel zones when the page has them', () => {
    const busy = new RoutingBusyError(new JobFailedError('rj1', 'stale'))
    expect(isochroneFault(busy, 'walk', 30, { hasExamples: true })).toBe(
      'Lots of people are plotting travel zones right now. Please try again in a few minutes, or open one of the example travel zones.',
    )
  })

  it('leaves a quick job failure as a routing failure', () => {
    expect(isochroneFault(new JobFailedError('rj1', 'no route'), 'walk', 30, { hasExamples: true })).toBe(
      ROUTING_FAILED,
    )
  })

  it('falls back for an unclassified failure', () => {
    expect(isochroneFault(new ApiError('boom', 500), 'walk', 30)).toBe(GENERIC)
    expect(isochroneFault(new Error('network down'), 'walk', 30)).toBe(GENERIC)
  })

  // SPA-290: seeded and authored isochrones now fail in the same envelope, so
  // one ApiError case counts for both rather than one per wrapper.
  it('counts an API failure with its HTTP status', () => {
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

// SPA-467: queue_position counts the in-flight jobs created before this one,
// so 0 means next; it is absent once running, and absent while queued when the
// API could not count — which reads as a plain wait rather than a guess.
describe('isochroneWaitMessage', () => {
  it.each([
    [{ status: 'queued', queue_position: 2 }, 'Waiting — 2 ahead of you'],
    [{ status: 'queued', queue_position: 1 }, 'Waiting — 1 ahead of you'],
    [{ status: 'queued', queue_position: 0 }, "You're next…"],
    [{ status: 'queued' }, 'Waiting…'],
    [{ status: 'running' }, 'Plotting…'],
  ] as const)('words %o as %s', (progress, message) => {
    expect(isochroneWaitMessage(progress)).toBe(message)
  })

  // A long queue is told as one before the job is given up on, so the visitor
  // knows to wait rather than reload.
  it('says the site is busy once a queued job has waited 30 seconds', () => {
    const busy = 'Lots of people are plotting right now, so this may take a minute…'
    expect(isochroneWaitMessage({ status: 'queued', queue_position: 12, waitedMs: 30_000 })).toBe(busy)
    expect(isochroneWaitMessage({ status: 'queued', waitedMs: 45_000 })).toBe(busy)
    expect(isochroneWaitMessage({ status: 'queued', queue_position: 12, waitedMs: 29_000 })).toBe(
      'Waiting — 12 ahead of you',
    )
    expect(isochroneWaitMessage({ status: 'running', waitedMs: 60_000 })).toBe('Plotting…')
  })

  it('says Waiting… before the first poll has answered', () => {
    expect(isochroneWaitMessage(null)).toBe('Waiting…')
  })
})
