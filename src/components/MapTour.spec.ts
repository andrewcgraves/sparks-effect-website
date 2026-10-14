import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { seriousA11yViolations } from '../test/axe'
import MapTour from './MapTour.vue'
import { TOUR_STEPS } from './tourSteps'
import { SAMPLE_MAP_PARTS } from './sampleMapData'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function mountTour() {
  wrapper = mount(MapTour, { attachTo: document.body })
  return wrapper
}

const items = (w: VueWrapper) => w.findAll('[data-testid="map-tour-steps"] > li')
const stepButton = (w: VueWrapper, index: number) => items(w)[index].get('button')
const button = (w: VueWrapper, name: string) => w.findAll('button').find((b) => b.text() === name)!
const counter = (w: VueWrapper) => w.get('[data-testid="map-tour-counter"]').text()
const status = (w: VueWrapper) => w.get('[data-testid="map-tour-status"]').text()
const litParts = (w: VueWrapper) =>
  SAMPLE_MAP_PARTS.filter((part) => w.get(`[data-part="${part}"]`).attributes('data-lit') === 'true')

describe('MapTour', () => {
  it('shows every step and its caption without anything being pressed', () => {
    const w = mountTour()
    const list = w.get('[data-testid="map-tour-steps"]').text()
    expect(items(w)).toHaveLength(TOUR_STEPS.length)
    for (const step of TOUR_STEPS) expect(list).toContain(step.caption)
  })

  it('opens on the whole map, with nothing announced', () => {
    const w = mountTour()
    expect(counter(w)).toBe('Overview')
    expect(litParts(w)).toEqual([...SAMPLE_MAP_PARTS])
    expect(status(w)).toBe('')
    expect(items(w).map((li) => li.get('button').attributes('aria-pressed'))).toEqual(
      TOUR_STEPS.map(() => 'false'),
    )
  })

  it('steps forward to the first step, lights what it explains and announces it', async () => {
    const w = mountTour()
    await button(w, 'Next').trigger('click')
    const first = TOUR_STEPS[0]
    expect(stepButton(w, 0).attributes('aria-pressed')).toBe('true')
    expect(counter(w)).toBe(`1 of ${TOUR_STEPS.length}`)
    expect(status(w)).toBe(`Step 1 of ${TOUR_STEPS.length}. ${first.name}. ${first.caption}`)
    expect(litParts(w)).toEqual(first.focus)
  })

  it('goes no further back than the first step, and no further on than the last', async () => {
    const w = mountTour()
    await button(w, 'Next').trigger('click')
    const back = button(w, 'Back')
    expect(back.attributes('aria-disabled')).toBe('true')
    back.element.focus()
    await back.trigger('click')
    expect(counter(w)).toBe(`1 of ${TOUR_STEPS.length}`)
    expect(document.activeElement).toBe(back.element)

    for (let i = 1; i < TOUR_STEPS.length; i++) await button(w, 'Next').trigger('click')
    expect(button(w, 'Next').attributes('aria-disabled')).toBe('true')
    await button(w, 'Next').trigger('click')
    expect(counter(w)).toBe(`${TOUR_STEPS.length} of ${TOUR_STEPS.length}`)
  })

  it('selects a step from the list, and returns to the whole map on a second press', async () => {
    const w = mountTour()
    await stepButton(w, 4).trigger('click')
    expect(counter(w)).toBe(`5 of ${TOUR_STEPS.length}`)
    expect(litParts(w)).toEqual(TOUR_STEPS[4].focus)

    await stepButton(w, 4).trigger('click')
    expect(counter(w)).toBe('Overview')
    expect(litParts(w)).toEqual([...SAMPLE_MAP_PARTS])
  })

  it('returns to the whole map from Show all', async () => {
    const w = mountTour()
    expect(w.findAll('button').some((b) => b.text() === 'Show all')).toBe(false)
    await stepButton(w, 2).trigger('click')
    await button(w, 'Show all').trigger('click')
    expect(counter(w)).toBe('Overview')
  })

  it('takes a click on the map to the step that explains what was clicked', async () => {
    const w = mountTour()
    await w.get('[data-part="egress-fill"]').trigger('click')
    const index = TOUR_STEPS.findIndex((step) => step.id === 'egress')
    expect(stepButton(w, index).attributes('aria-pressed')).toBe('true')
  })

  it('has no serious accessibility violations, at rest or mid-tour', async () => {
    const w = mountTour()
    expect(await seriousA11yViolations(w)).toEqual([])
    await stepButton(w, 5).trigger('click')
    expect(await seriousA11yViolations(w)).toEqual([])
  })
})
