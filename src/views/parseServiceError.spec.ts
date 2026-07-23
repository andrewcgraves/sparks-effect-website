import { describe, expect, it } from 'vitest'
import { extractOffendingStopNames } from './parseServiceError'

describe('extractOffendingStopNames', () => {
  it('extracts the stop name from an off-route rejection', () => {
    const message = 'POST /api/services failed: 422: stop "Fresno" is 620 m from route "main-line"'
    expect(extractOffendingStopNames(message)).toEqual(['Fresno'])
  })

  it('extracts the stop name from an off-route rejection reported in kilometres', () => {
    const message = 'POST /api/services failed: 422: stop "Gilroy" is 3.2 km from route "main-line"'
    expect(extractOffendingStopNames(message)).toEqual(['Gilroy'])
  })

  it('extracts both stop names from an order-fault rejection', () => {
    const message =
      'PUT /api/services/x failed: 422: stop "Gilroy" (seq 2) lies after "Fresno" (seq 3) along this route'
    expect(extractOffendingStopNames(message)).toEqual(['Gilroy', 'Fresno'])
  })

  it('extracts both stop names from a "lies before" order fault', () => {
    const message = 'stop "A" (seq 0) lies before "B" (seq 1) along this route'
    expect(extractOffendingStopNames(message)).toEqual(['A', 'B'])
  })

  it('returns an empty array for a message it does not recognize', () => {
    expect(extractOffendingStopNames('route_slug is required')).toEqual([])
  })

  it('does not mistake the route slug for a stop name in an off-route message', () => {
    const message = 'stop "Fresno" is 620 m from route "main-line"'
    expect(extractOffendingStopNames(message)).not.toContain('main-line')
  })
})
