import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import NotFoundView from './NotFoundView.vue'
import { seriousA11yViolations } from '../test/axe'

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

  it('has no serious or critical accessibility violations', async () => {
    const wrapper = mount(NotFoundView, { global: { stubs: { RouterLink: RouterLinkStub } }, attachTo: document.body })
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })
})
