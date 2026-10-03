import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SkeletonShape from './SkeletonShape.vue'

describe('SkeletonShape', () => {
  it('is hidden from assistive technology, leaving the announcement to its region', () => {
    expect(mount(SkeletonShape).attributes('aria-hidden')).toBe('true')
  })

  it('draws a placeholder-coloured shimmer shape', () => {
    expect(mount(SkeletonShape).find('.skeleton').exists()).toBe(true)
  })

  it('stands a line in for one line box of the surrounding type', () => {
    expect(mount(SkeletonShape).classes()).toContain('h-[1lh]')
  })

  it('takes its size from the caller so it can match the content it stands in for', () => {
    const wrapper = mount(SkeletonShape, { props: { shape: 'block' }, attrs: { class: 'h-[70vh]' } })
    expect(wrapper.classes()).toContain('h-[70vh]')
  })

  it('draws a card as a surface frame with a heading bar and the requested number of lines', () => {
    const wrapper = mount(SkeletonShape, { props: { shape: 'card', lines: 4 } })
    expect(wrapper.classes()).toContain('bg-surface')
    expect(wrapper.findAll('[data-skeleton-part="heading"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-skeleton-part="line"]')).toHaveLength(4)
  })
})
