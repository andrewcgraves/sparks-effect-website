// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './authoring/client'
import type { ScenarioInput, ServiceInput } from './authoring/types'
import { JobFailedError } from './polling'
import {
  GENERIC_AUTHORING_FAULT,
  SESSION_EXPIRED_FAULT,
  UNREACHABLE_FAULT,
  authoringFault,
  unnamedFieldSegments,
} from './authoringFault'

// Every field path an authoring input can carry, in the API's dotted form, with
// `[]` marking one the API reports per entry (with an index) rather than whole.
type FieldPath<T, Prefix extends string = ''> = {
  [K in keyof T & string]-?: NonNullable<T[K]> extends readonly (infer Entry)[]
    ? `${Prefix}${K}` | `${Prefix}${K}[]` | (Entry extends object ? FieldPath<Entry, `${Prefix}${K}[].`> : never)
    : NonNullable<T[K]> extends object
      ? `${Prefix}${K}` | FieldPath<NonNullable<T[K]>, `${Prefix}${K}.`>
      : `${Prefix}${K}`
}[keyof T & string]

type AuthoringInputField = FieldPath<ServiceInput> | FieldPath<ScenarioInput>

// `satisfies` makes this list the types' own: a field added to ServiceInput or
// ScenarioInput fails the typecheck until it is listed here, and listing it
// fails the spec below until authoringFault.ts has a word for it.
const AUTHORING_INPUT_FIELDS = Object.keys({
  route_slug: true,
  name: true,
  subtext: true,
  description: true,
  stops: true,
  'stops[]': true,
  'stops[].name': true,
  'stops[].lat': true,
  'stops[].lng': true,
  'stops[].seq': true,
  'stops[].slug': true,
  'stops[].chainage_m': true,
  'stops[].offset_m': true,
  vehicle: true,
  'vehicle.max_speed_kmh': true,
  'vehicle.acceleration_ms2': true,
  'vehicle.deceleration_ms2': true,
  'vehicle.dwell_s': true,
  frequency_windows: true,
  'frequency_windows[]': true,
  'frequency_windows[].start_time': true,
  'frequency_windows[].end_time': true,
  'frequency_windows[].headway_s': true,
  service_ids: true,
  'service_ids[]': true,
  interchange_pairs: true,
  'interchange_pairs[]': true,
  'interchange_pairs[].a': true,
  'interchange_pairs[].a.service_id': true,
  'interchange_pairs[].a.slug': true,
  'interchange_pairs[].b': true,
  'interchange_pairs[].b.service_id': true,
  'interchange_pairs[].b.slug': true,
  boarding_wait: true,
  'boarding_wait.policy': true,
  'boarding_wait.secs': true,
} satisfies Record<AuthoringInputField, true>)

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

    // The API rejects a bad boarding wait before it validates anything, as a
    // code-less 422 (below), so it sends no per-field fault for one today.
    // These are paths the input types allow, held to words in case it does.
    it('would name a boarding wait field in the form’s words, not the API’s', () => {
      const message = authoringFault(
        validation([
          { field: 'boarding_wait.policy', rule: 'unknown', message: 'boarding wait: unrecognised policy' },
          { field: 'boarding_wait.secs', rule: 'non_negative', message: 'boarding wait: fixed seconds must be non-negative' },
        ]),
        'scenario',
      )
      expect(message).toBe(
        "Boarding wait isn't one we recognise. Boarding wait seconds can't be negative.",
      )
      expect(message).not.toMatch(/\bsecs\b|\bpolicy\b/i)
    })

    it('names a side of an interchange the way the API reports it', () => {
      const message = authoringFault(
        validation([
          {
            field: 'interchange_pairs.a',
            index: 0,
            rule: 'not_member',
            message: 'interchange_pairs[0].a: service "svc9" is not a member of this scenario',
          },
        ]),
        'scenario',
      )
      expect(message).toBe("Interchange 1: first line isn't part of this network.")
      expect(message).not.toMatch(/svc9|service|scenario/i)
    })

    // The API reports a side of a pair whole (above); these deeper paths are
    // ones the input types allow, held to words in case it ever names them.
    it('would name an interchange stop by its line and stop, not its service id', () => {
      const message = authoringFault(
        validation([
          { field: 'interchange_pairs.a.service_id', index: 0, rule: 'required', message: 'pair 0: a.service_id is required' },
          { field: 'interchange_pairs.b.slug', index: 1, rule: 'required', message: 'pair 1: b.slug is required' },
        ]),
        'scenario',
      )
      expect(message).toBe('Interchange 1: first line is required. Interchange 2: second stop is required.')
      expect(message).not.toMatch(/service id|slug/i)
    })

    // What a bad boarding wait actually gets back: no code, and the API's own
    // sentence as the message.
    it('says a code-less 422 in its own words, never the API’s', () => {
      const err = new ApiError(
        'PUT /api/user-scenarios/coast failed: 422: boarding wait: unrecognised policy "x" ' +
          '(want none, half_headway, full_headway, or fixed)',
        422,
      )
      const message = authoringFault(err, 'scenario')
      expect(message).toBe("Some of this network's details weren't accepted. Check them and try again.")
      expect(message).not.toMatch(/boarding wait|policy|unrecognised|"x"|half_headway/i)
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
    expect(message).toBe("This line couldn't be compiled. Check its stops and frequency windows, then try again.")
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

describe('authoring field words', () => {
  it.each(AUTHORING_INPUT_FIELDS)('has a word for every segment of %s', (path) => {
    const field = path.replace(/\[\]/g, '')
    const index = path.includes('[]') ? 0 : undefined
    expect(unnamedFieldSegments({ field, index })).toEqual([])
  })
})
