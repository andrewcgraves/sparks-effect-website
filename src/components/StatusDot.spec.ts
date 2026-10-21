import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusDot from './StatusDot.vue'
import { seriousA11yViolations } from '../test/axe'

type DotTone = 'quiet' | 'caution' | 'busy' | 'error'

const TONES: [DotTone, string[]][] = [
  ['quiet', ['bg-ink-faint']],
  ['caution', ['bg-apricot']],
  ['busy', ['animate-pulse', 'bg-coral']],
  ['error', ['bg-error']],
]

describe('StatusDot', () => {
  it.each(TONES)('draws a %s dot in its tone', (tone, classes) => {
    const dot = mount(StatusDot, { props: { tone } })
    expect(dot.classes()).toEqual(expect.arrayContaining(['size-2', 'rounded-full', ...classes]))
  })

  it('pulses only while busy', () => {
    for (const [tone] of TONES.filter(([tone]) => tone !== 'busy')) {
      expect(mount(StatusDot, { props: { tone } }).classes()).not.toContain('animate-pulse')
    }
  })

  // The words beside the dot say what it means; the dot only repeats it in colour.
  it.each(TONES)('is hidden from assistive technology as %s', async (tone) => {
    const dot = mount(StatusDot, { props: { tone }, attachTo: document.body })
    expect(dot.attributes('aria-hidden')).toBe('true')
    expect(dot.attributes('role')).toBeUndefined()
    expect(await seriousA11yViolations(dot)).toEqual([])
    dot.unmount()
  })
})
