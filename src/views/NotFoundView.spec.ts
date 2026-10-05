import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import NotFoundView from './NotFoundView.vue'

function mountView() {
  return mount(NotFoundView, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('NotFoundView', () => {
  it('renders a static not-found message', () => {
    const wrapper = mountView()
    expect(wrapper.get('h1').text()).toBe('Page not found')
  })

  it('links home, where the published networks and lines are listed', () => {
    const wrapper = mountView()
    const home = wrapper.getComponent(RouterLinkStub)
    expect(home.props('to')).toBe('/')
    expect(home.text()).toContain('published networks and lines')
  })
})
