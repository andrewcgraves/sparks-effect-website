import { describe, expect, it } from 'vitest'
import { isochroneLegend } from '../composables/useIsochroneLayer'
import { stationNamed } from '../fixtures/tourSample'
import { TOUR_PARTS } from './tourHighlight'
import { TOUR_STEPS } from './tourSteps'

const key = Object.fromEntries(
  isochroneLegend(undefined, { unfinished: true, starterWalk: true }).map((e) => [e.source, e.label]),
)
const step = (id: string) => TOUR_STEPS.find((s) => s.id === id)!

describe('TOUR_STEPS', () => {
  it('follows the trip outward from the start', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      'start',
      'starter-walk',
      'origin-reach',
      'ridden',
      'egress',
      'unfinished',
      'unridden',
    ])
  })

  it('names each step as the map key does', () => {
    expect(step('starter-walk').name).toBe(key.starter)
    expect(step('origin-reach').name).toBe(key.origin)
    expect(step('egress').name).toBe(key.egress)
    expect(step('unfinished').caption).toContain(key.unfinished)
  })

  it('lights only parts the tour map can dim', () => {
    for (const s of TOUR_STEPS) for (const part of s.lit) expect(TOUR_PARTS).toContain(part)
  })

  it('reads its example from the plot it draws', () => {
    expect(step('egress').caption).toContain(`${stationNamed('palmdale').name}, reached with 12 minutes to spare`)
  })

  it('keeps every caption to two sentences', () => {
    for (const s of TOUR_STEPS) {
      expect(s.caption.split(/(?<=[.!?])\s+(?=[A-Z])/).length).toBeLessThanOrEqual(2)
    }
  })

  it('carries the reviewed wording', () => {
    expect(step('starter-walk').caption).toMatch(/the station you could reach first/)
    expect(step('unridden').caption).toMatch(/which no trip here rides from one station to the next/)
  })
})
