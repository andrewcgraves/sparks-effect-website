// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './authoring/client'
import { JobFailedError } from './polling'
import {
  GENERIC_AUTHORING_FAULT,
  SESSION_EXPIRED_FAULT,
  UNREACHABLE_FAULT,
  authoringFault,
} from './authoringFault'

function validation(faults: unknown[]): ApiError {
  return new ApiError(
    'POST /api/services failed: 422: frequency window 0: headway_s must be positive',
    422,
    'validation',
    { faults },
  )
}

describe('authoringFault', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports the raw error for debugging rather than showing it', () => {
    const err = new ApiError('POST /api/services failed: 500: boom', 500)
    const message = authoringFault(err)
    expect(console.error).toHaveBeenCalledWith('[authoring]', err)
    expect(message).not.toContain('failed: 500')
  })

  it('points an expired session at signing in again', () => {
    expect(authoringFault(new ApiError('GET /api/me failed: 401', 401))).toBe(SESSION_EXPIRED_FAULT)
  })

  it.each([403, 404])('says a %i service no longer exists or is not yours', (status) => {
    expect(authoringFault(new ApiError('PUT failed', status))).toBe(
      "This line no longer exists or isn't yours.",
    )
  })

  it('names a scenario when the page is about one', () => {
    expect(authoringFault(new ApiError('PUT failed', 404), 'scenario')).toBe(
      "This network no longer exists or isn't yours.",
    )
  })

  it('names a route when the page is about one', () => {
    expect(authoringFault(new ApiError('GET failed', 404), 'route')).toBe(
      "This route no longer exists or isn't yours.",
    )
  })

  describe('a 409 route_in_use', () => {
    function inUse(detail: unknown): ApiError {
      return new ApiError('DELETE /api/me/routes/main failed: 409: in use', 409, 'route_in_use', detail)
    }

    it('counts the lines built on it, curated and authored together', () => {
      expect(authoringFault(inUse({ services: 1, user_services: 1, segments: 3 }), 'route')).toBe(
        'Used by 2 lines. Move them to another route first.',
      )
    })

    it('reads singular for one line', () => {
      expect(authoringFault(inUse({ services: 0, user_services: 1, segments: 0 }), 'route')).toBe(
        'Used by 1 line. Move it to another route first.',
      )
    })

    it('mentions segments only when they are all that holds the route', () => {
      expect(authoringFault(inUse({ services: 0, user_services: 0, segments: 3 }), 'route')).toBe(
        'Used by 3 segments. Remove them first.',
      )
    })

    it('still says the route is in use when the counts are missing', () => {
      expect(authoringFault(inUse(undefined), 'route')).toBe(
        'This route is still in use. Move its lines to another route first.',
      )
    })
  })

  it('tells the author to recompile on stale_graph', () => {
    expect(authoringFault(new ApiError('PUT failed: 409: stale', 409, 'stale_graph'))).toBe(
      'This line changed since it was last compiled. Compile it again, then retry.',
    )
  })

  describe('a 422 validation fault', () => {
    it('names the field in words, counting entries from one', () => {
      const message = authoringFault(
        validation([
          { field: 'frequency_windows.headway_s', index: 0, rule: 'positive', message: 'frequency window 0: headway_s must be positive' },
        ]),
      )
      expect(message).toBe('Frequency window 1: headway must be more than zero.')
      expect(message).not.toContain('headway_s')
      expect(message).not.toContain('frequency_windows')
    })

    it('says the first fault for each field, and only the first', () => {
      const message = authoringFault(
        validation([
          { field: 'name', rule: 'required', message: 'name is required' },
          { field: 'stops.lat', index: 2, rule: 'range', message: 'stop 2: lat must be between -90 and 90' },
          { field: 'stops.lat', index: 4, rule: 'range', message: 'stop 4: lat must be between -90 and 90' },
          { field: 'vehicle.dwell_s', rule: 'non_negative', message: 'vehicle.dwell_s must be >= 0' },
        ]),
      )
      expect(message).toBe(
        "Name is required. Stop 3: latitude is out of range. Dwell time can't be negative.",
      )
    })

    it('says a subtext or description is too long', () => {
      expect(
        authoringFault(
          validation([
            { field: 'subtext', rule: 'max_length', message: 'subtext must be at most 140 characters' },
            { field: 'description', rule: 'max_length', message: 'description must be at most 4000 characters' },
          ]),
        ),
      ).toBe('Subtext is too long. Description is too long.')
    })

    it('says a service needs at least two stops', () => {
      expect(
        authoringFault(validation([{ field: 'stops', rule: 'min_count', message: 'a service needs at least two stops' }])),
      ).toBe('A line needs at least two stops.')
    })

    it('agrees the verb with a whole list', () => {
      expect(
        authoringFault(validation([{ field: 'segments', rule: 'count', message: 'segments count mismatch' }])),
      ).toBe('Segments have the wrong number of entries.')
    })

    it('still reads as words for a field this build has no name for', () => {
      expect(
        authoringFault(validation([{ field: 'platform_length_m', rule: 'mystery', message: 'x' }])),
      ).toBe("Platform length isn't valid.")
    })

    it('falls back to a summary when the faults are missing', () => {
      expect(authoringFault(new ApiError('POST failed: 422: bad', 422, 'validation'))).toBe(
        "Some of this line's details weren't accepted. Check them and try again.",
      )
    })
  })

  describe('a 422 stop_placement fault', () => {
    const b = { seq: 1, name: 'B', slug: 'b', chainage_m: 12000, offset_m: 620 }
    const c = { seq: 2, name: 'C', slug: 'c', chainage_m: 8000, offset_m: 10 }

    function placement(detail: unknown): ApiError {
      return new ApiError('POST /api/services failed: 422: stop "B" is 620 m from route', 422, 'stop_placement', detail)
    }

    it('keeps a summary line naming the off-route stop', () => {
      expect(authoringFault(placement({ fault: 'off_route', route_slug: 'main', threshold_m: 500, stops: [b] }))).toBe(
        'Stop "B" is too far from the route. Move it onto the route and save again.',
      )
    })

    it('keeps a summary line naming the out-of-order pair', () => {
      expect(authoringFault(placement({ fault: 'chainage_order', route_slug: 'main', stops: [b, c] }))).toBe(
        'Stops "B" and "C" are out of order along the route. Reorder them and save again.',
      )
    })

    it('falls back to a general line for a fault it cannot read', () => {
      expect(authoringFault(placement({ fault: 'from_the_future', stops: [b] }))).toBe(
        "Some stops don't sit on the route. Check the flagged stops and save again.",
      )
    })
  })

  describe('a 429', () => {
    it('quotes Retry-After', () => {
      expect(authoringFault(new ApiError('POST failed: 429', 429, 'rate_limited', undefined, 30))).toBe(
        "You're going a little fast. Try again in 30 seconds.",
      )
    })

    it('says to wait a moment when there is no Retry-After', () => {
      expect(authoringFault(new ApiError('POST failed: 429', 429, 'rate_limited'))).toBe(
        "You're going a little fast. Wait a moment, then try again.",
      )
    })
  })

  it.each([500, 502, 503])('reassures the draft is saved on a %i', (status) => {
    expect(authoringFault(new ApiError('POST failed', status))).toBe(UNREACHABLE_FAULT)
  })

  it('reassures the draft is saved when the request never got an answer', () => {
    expect(authoringFault(new TypeError('Failed to fetch'))).toBe(UNREACHABLE_FAULT)
  })

  it('says a failed compile job could not be compiled, without its raw reason', () => {
    const message = authoringFault(new JobFailedError('3f2', 'compile: loading routes: boom'))
    expect(message).toBe("This line couldn't be compiled. Check its stops and timetable, then try again.")
  })

  it('advises on a scenario compile in scenario terms', () => {
    expect(authoringFault(new JobFailedError('3f2', 'boom'), 'scenario')).toBe(
      "This network couldn't be compiled. Check its lines and interchanges, then try again.",
    )
  })

  it('falls back to a generic line for anything else', () => {
    expect(authoringFault(new Error('Job 3f2 timed out after 60000ms'))).toBe(GENERIC_AUTHORING_FAULT)
    expect(authoringFault(new ApiError('failed: 418', 418))).toBe(GENERIC_AUTHORING_FAULT)
  })
})
