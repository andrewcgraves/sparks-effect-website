import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type PropType } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { seriousA11yViolations } from '../test/axe'
import MapTour from './MapTour.vue'
import { TOUR_STEPS, type TourStep } from './tourSteps'

vi.mock('./TourMap.vue', () => ({
  default: defineComponent({
    props: { step: { type: Object as PropType<TourStep | null>, default: null } },
    setup: (props) => () => h('div', { 'data-testid': 'tour-map', 'data-step': props.step?.id ?? '' }),
  }),
}))

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function mountTour() {
  wrapper = mount(MapTour, { attachTo: document.body })
  return wrapper
}

const cards = (w: VueWrapper) => w.findAll('[data-testid="map-tour-steps"] > li')
const status = (w: VueWrapper) => w.get('[data-testid="map-tour-status"]').text()

describe('MapTour', () => {
  it('reads as a list of every step and its caption, with nothing pressed', () => {
    const w = mountTour()
    const list = w.get('[data-testid="map-tour-steps"]').text()
    expect(cards(w)).toHaveLength(TOUR_STEPS.length)
    for (const step of TOUR_STEPS) {
      expect(list).toContain(step.name)
      expect(list).toContain(step.caption)
    }
  })

  it('opens on the whole map, every card at full strength and nothing announced', () => {
    const w = mountTour()
    expect(w.get('[data-testid="tour-map"]').attributes('data-step')).toBe('')
    expect(w.findAll('.opacity-40')).toHaveLength(0)
    expect(status(w)).toBe('')
  })

  it('lights a chosen step on the map, says so, and fades the others back', async () => {
    const w = mountTour()
    const egress = TOUR_STEPS.findIndex((s) => s.id === 'egress')
    await cards(w)[egress].get('button').trigger('click')
    expect(cards(w)[egress].get('button').attributes('aria-current')).toBe('step')
    expect(w.get('[data-testid="tour-map"]').attributes('data-step')).toBe('egress')
    expect(status(w)).toBe('Highlighting: From station')
    expect(w.findAll('.opacity-40')).toHaveLength(TOUR_STEPS.length - 1)
  })

  it('lets the keyboard drive the map, and never takes a focused control away', async () => {
    const w = mountTour()
    const before = w.findAll('button').length
    const button = cards(w)[1].get('button')
    ;(button.element as HTMLButtonElement).focus()
    await button.trigger('focus')
    expect(w.get('[data-testid="tour-map"]').attributes('data-step')).toBe(TOUR_STEPS[1].id)
    expect(w.findAll('button')).toHaveLength(before)
    expect(document.activeElement).toBe(button.element)
  })

  it('has no serious accessibility violations, at rest or mid-tour', async () => {
    const w = mountTour()
    expect(await seriousA11yViolations(w)).toEqual([])
    await cards(w)[3].get('button').trigger('click')
    expect(await seriousA11yViolations(w)).toEqual([])
  })
})
