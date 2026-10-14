import { describe, expect, it } from 'vitest'
import { isochroneLegend } from '../composables/useIsochroneLayer'
import { SAMPLE_MAP_PARTS } from './sampleMapData'
import { TOUR_STEPS, stepForPart } from './tourSteps'

const legend = isochroneLegend(undefined, { unfinished: true, starterWalk: true })
const labelOf = (source: string) => legend.find((entry) => entry.source === source)!.label

describe('TOUR_STEPS', () => {
  it('walks from the start, outward, to the rest of the network', () => {
    expect(TOUR_STEPS.map((step) => step.id)).toEqual([
      'origin',
      'origin-reach',
      'starter-walk',
      'stations',
      'ridden',
      'unfinished',
      'egress',
      'unridden',
    ])
    expect(TOUR_STEPS.map((step) => step.name)).toEqual([
      'Starting point',
      'Origin reach',
      'First leg — nearest station',
      'Stations',
      'Ridden',
      'Unfinished',
      'From station',
      'Unridden',
    ])
  })

  it('names the areas and the first leg as the map key does', () => {
    const byId = Object.fromEntries(TOUR_STEPS.map((step) => [step.id, step.name]))
    expect(byId['origin-reach']).toBe(labelOf('origin'))
    expect(byId['egress']).toBe(labelOf('egress'))
    expect(byId['starter-walk']).toBe(labelOf('starter'))
  })

  it('quotes the key\'s label for the dot that ends an unfinished ride', () => {
    const unfinished = TOUR_STEPS.find((step) => step.id === 'unfinished')!
    expect(unfinished.caption).toContain(`“${labelOf('unfinished')}”`)
  })

  it('only lights parts the sample map draws, and lights something every step', () => {
    for (const step of TOUR_STEPS) {
      expect(step.focus.length).toBeGreaterThan(0)
      for (const part of step.focus) expect(SAMPLE_MAP_PARTS).toContain(part)
    }
  })
})

describe('stepForPart', () => {
  it('takes a click on any part of the map to the step that explains it', () => {
    expect(stepForPart('origin-marker')).toBe(0)
    expect(stepForPart('origin-fill')).toBe(1)
    expect(stepForPart('origin-walk')).toBe(2)
    expect(stepForPart('station-dots')).toBe(3)
    expect(stepForPart('ridden-line')).toBe(4)
    expect(stepForPart('progress-line')).toBe(5)
    expect(stepForPart('progress-cap')).toBe(5)
    expect(stepForPart('egress-fill')).toBe(6)
    expect(stepForPart('route-line')).toBe(7)
  })
})
