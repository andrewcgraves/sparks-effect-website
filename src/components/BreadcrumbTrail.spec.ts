import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import BreadcrumbTrail from './BreadcrumbTrail.vue'

function mountCrumbs(items: { label: string, to?: string }[]) {
  return mount(BreadcrumbTrail, { props: { items }, global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('BreadcrumbTrail', () => {
  it('renders the trail as an ordered list inside a labelled nav', () => {
    const wrapper = mountCrumbs([
      { label: 'My authoring', to: '/authoring' },
      { label: 'Coast Express', to: '/authoring/services/coast-express' },
      { label: 'Edit' },
    ])
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Breadcrumb')
    expect(wrapper.findAll('nav > ol > li > :not([aria-hidden])').map((crumb) => crumb.text())).toEqual([
      'My authoring',
      'Coast Express',
      'Edit',
    ])
  })

  it('links every crumb but the last to where it leads', () => {
    const wrapper = mountCrumbs([
      { label: 'My authoring', to: '/authoring' },
      { label: 'Coast Express', to: '/authoring/services/coast-express' },
      { label: 'Edit' },
    ])
    expect(wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))).toEqual([
      '/authoring',
      '/authoring/services/coast-express',
    ])
  })

  it('marks the last crumb as the current page, and only that one', () => {
    const wrapper = mountCrumbs([
      { label: 'My authoring', to: '/authoring' },
      { label: 'New service' },
    ])
    const current = wrapper.findAll('[aria-current]')
    expect(current).toHaveLength(1)
    expect(current[0]!.attributes('aria-current')).toBe('page')
    expect(current[0]!.text()).toBe('New service')
  })

  it('does not link the current page even when it is given a destination', () => {
    const wrapper = mountCrumbs([
      { label: 'My authoring', to: '/authoring' },
      { label: 'Coast Express', to: '/authoring/services/coast-express' },
    ])
    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(1)
  })
})
