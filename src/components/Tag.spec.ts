import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Tag from './Tag.vue'
import { seriousA11yViolations } from '../test/axe'

type TagTone = 'neutral' | 'caution' | 'error'

function mountTag(tone: TagTone, options: { attachTo?: HTMLElement } = {}) {
  return mount(Tag, { props: { tone }, slots: { default: 'Out of date' }, ...options })
}

describe('Tag', () => {
  it('sets every tag in the one tag role, at one size and family', () => {
    for (const tone of ['neutral', 'caution', 'error'] as const) {
      const tag = mountTag(tone)
      expect(tag.classes()).toEqual(expect.arrayContaining(['t-tag', 'rounded-(--radius-field)', 'border', 'px-1.5']))
      expect(tag.text()).toBe('Out of date')
    }
  })

  it.each<[TagTone, string[]]>([
    ['neutral', ['border-border']],
    ['caution', ['border-apricot', 'bg-apricot/15', 'text-ink']],
    ['error', ['border-error', 'text-error']],
  ])('draws a %s tag in its tone', (tone, classes) => {
    expect(mountTag(tone).classes()).toEqual(expect.arrayContaining(classes))
  })

  it('carries no role of its own, leaving its words to be read in place', () => {
    expect(mountTag('caution').attributes('role')).toBeUndefined()
  })

  it('keeps the attributes a caller gives it', () => {
    const tag = mount(Tag, { props: { tone: 'caution' }, attrs: { 'data-testid': 'handover-pending', class: 'self-start' } })
    expect(tag.attributes('data-testid')).toBe('handover-pending')
    expect(tag.classes()).toContain('self-start')
  })

  it.each<TagTone>(['neutral', 'caution', 'error'])('has no serious or critical accessibility violations as %s', async (tone) => {
    const tag = mountTag(tone, { attachTo: document.body })
    expect(await seriousA11yViolations(tag)).toEqual([])
    tag.unmount()
  })
})
