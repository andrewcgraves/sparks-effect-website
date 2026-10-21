import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, type PropType } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { seriousA11yViolations } from '../test/axe'
import MapTour from './MapTour.vue'
import { TOUR_STEPS, type TourStep } from './tourSteps'
import type { TourInset } from './tourInset'

vi.mock('./TourMap.vue', () => ({
  default: defineComponent({
    props: {
      step: { type: Object as PropType<TourStep | null>, default: null },
      inset: { type: Object as PropType<TourInset>, default: undefined },
    },
    setup: (props) => () =>
      h('div', { 'data-testid': 'tour-map', 'data-step': props.step?.id ?? '', 'data-inset-left': props.inset?.left }),
  }),
}))

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mountTour() {
  wrapper = mount(MapTour, { attachTo: document.body })
  return wrapper
}

const mapStep = (w: VueWrapper) => w.get('[data-testid="tour-map"]').attributes('data-step')
const shown = (w: VueWrapper) => w.findAll('[data-step]:not([aria-hidden])').filter((e) => e.classes('visible'))
const back = (w: VueWrapper) => w.get('[data-testid="map-tour-back"]')
const next = (w: VueWrapper) => w.get('[data-testid="map-tour-next"]')
const status = (w: VueWrapper) => w.get('[data-testid="map-tour-status"]').text()

describe('MapTour', () => {
  it('opens on the first step, on the map and in the card, with nothing announced', () => {
    const w = mountTour()
    expect(mapStep(w)).toBe(TOUR_STEPS[0].id)
    expect(shown(w).map((e) => e.attributes('data-step'))).toEqual([TOUR_STEPS[0].id])
    expect(w.get('[data-testid="map-tour-card"]').text()).toContain(`Step 1 of ${TOUR_STEPS.length}`)
    expect(back(w).attributes('disabled')).toBeDefined()
    expect(status(w)).toBe('')
  })

  it('keeps every caption in the card, showing only the current one', () => {
    const w = mountTour()
    const card = w.get('[data-testid="map-tour-card"]')
    for (const step of TOUR_STEPS) expect(card.text()).toContain(step.caption)
    expect(w.findAll('[data-step][aria-hidden="true"]')).toHaveLength(TOUR_STEPS.length - 1)
  })

  it('moves the map and the card on with Next and back with Back, and says where it is', async () => {
    const w = mountTour()
    await next(w).trigger('click')
    await next(w).trigger('click')
    expect(mapStep(w)).toBe(TOUR_STEPS[2].id)
    expect(shown(w).map((e) => e.attributes('data-step'))).toEqual([TOUR_STEPS[2].id])
    expect(status(w)).toBe(`Step 3 of ${TOUR_STEPS.length}: ${TOUR_STEPS[2].name}. ${TOUR_STEPS[2].caption}`)
    await back(w).trigger('click')
    expect(mapStep(w)).toBe(TOUR_STEPS[1].id)
    expect(back(w).attributes('disabled')).toBeUndefined()
  })

  it('offers to start over from the last step', async () => {
    const w = mountTour()
    for (let i = 1; i < TOUR_STEPS.length; i++) await next(w).trigger('click')
    expect(mapStep(w)).toBe(TOUR_STEPS[TOUR_STEPS.length - 1].id)
    expect(next(w).text()).toBe('Start over')
    await next(w).trigger('click')
    expect(mapStep(w)).toBe(TOUR_STEPS[0].id)
    expect(next(w).text()).toBe('Next')
  })

  it('tells the map how much of its left side the floating card covers', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const right = this.dataset.testid === 'map-tour-card' ? 88 + 340 : 1440
      return { left: 0, right } as DOMRect
    })
    const w = mountTour()
    await nextTick()
    expect(w.get('[data-testid="tour-map"]').attributes('data-inset-left')).toBe('428')
  })

  it('leaves the map uncovered on a phone, where the card sits below it', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const w = mountTour()
    expect(w.get('[data-testid="tour-map"]').attributes('data-inset-left')).toBe('0')
  })

  it('keeps the card after the map, so it is read and tabbed to after it', () => {
    const w = mountTour()
    const order = w.findAll('[data-testid="tour-map"], [data-testid="map-tour-card"], button').map((e) =>
      e.attributes('data-testid'))
    expect(order).toEqual(['tour-map', 'map-tour-card', 'map-tour-back', 'map-tour-next'])
  })

  it('has no serious accessibility violations, at the start or mid-tour', async () => {
    const w = mountTour()
    expect(await seriousA11yViolations(w)).toEqual([])
    await next(w).trigger('click')
    await next(w).trigger('click')
    expect(await seriousA11yViolations(w)).toEqual([])
  })
})
