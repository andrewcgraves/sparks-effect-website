import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'

function mountRegion(props: { label?: string } = {}) {
  return mount(LoadingRegion, { props, slots: { default: () => [h(SkeletonShape), h(SkeletonShape)] } })
}

describe('LoadingRegion', () => {
  it('marks itself busy', () => {
    expect(mountRegion().attributes('aria-busy')).toBe('true')
  })

  it('announces "Loading" once, to screen readers only', () => {
    const announcements = mountRegion().findAll('.sr-only')
    expect(announcements).toHaveLength(1)
    expect(announcements[0].text()).toBe('Loading')
  })

  it('names what is loading when told', () => {
    expect(mountRegion({ label: 'Loading service' }).get('.sr-only').text()).toBe('Loading service')
  })

  it('shows the skeletons it is given', () => {
    expect(mountRegion().findAllComponents(SkeletonShape)).toHaveLength(2)
  })
})
