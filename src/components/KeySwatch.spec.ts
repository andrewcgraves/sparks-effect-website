import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KeySwatch from './KeySwatch.vue'
import { KEY_SWATCH_KINDS } from './keySwatchPaint'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'

const ink = THEME_TOKEN_FALLBACKS['--color-ink']

describe('KeySwatch', () => {
  it('draws every kind, hidden from assistive tech', () => {
    for (const kind of KEY_SWATCH_KINDS) {
      const swatch = mount(KeySwatch, { props: { kind } })
      expect(swatch.attributes('aria-hidden')).toBe('true')
    }
  })

  it('draws the unfinished ride as the map does: ink dashes stopping on a bare ink dot', () => {
    const swatch = mount(KeySwatch, { props: { kind: 'unfinished' } })
    expect(swatch.get('line').attributes('stroke')).toBe(ink)
    expect(swatch.get('line').attributes('stroke-dasharray')).toBe('2.5 8.75')
    expect(swatch.get('circle').attributes('fill')).toBe(ink)
    expect(swatch.get('circle').attributes('stroke')).toBeUndefined()
  })

  it('draws the first leg in the origin colour, from the pin to a ringed station', () => {
    const swatch = mount(KeySwatch, { props: { kind: 'starter' } })
    expect(swatch.get('line').attributes('stroke')).toBe(THEME_TOKEN_FALLBACKS['--color-data-origin'])
    expect(swatch.get('line').attributes('stroke-dasharray')).toBe('2 4')
    const [from, to] = swatch.findAll('circle')
    expect(from.attributes('fill')).toBe(THEME_TOKEN_FALLBACKS['--color-coral'])
    expect(to.attributes('stroke')).toBe(ink)
  })

  it('draws the unridden line in the faint grey the plotted network turns', () => {
    const swatch = mount(KeySwatch, { props: { kind: 'unridden' } })
    expect(swatch.get('line').attributes('stroke')).toBe('#b8b8be')
  })

  it('fills the reach swatches with their area colours', () => {
    expect(mount(KeySwatch, { props: { kind: 'origin' } }).attributes('style')).toContain('background-color')
    expect(mount(KeySwatch, { props: { kind: 'egress' } }).html()).not.toContain('<svg')
  })
})
