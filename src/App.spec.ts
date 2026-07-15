import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import App from './App.vue'

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        RouterView: true,
      },
    },
  })
}

describe('App', () => {
  it('renders the Sparks Effect brand linking to the home route', () => {
    const wrapper = mountApp()
    const brand = wrapper.findComponent(RouterLinkStub)
    expect(brand.exists()).toBe(true)
    expect(brand.text()).toBe('Sparks Effect')
    expect(brand.props('to')).toBe('/')
  })

  it('renders a router view for the active route', () => {
    const wrapper = mountApp()
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true)
  })

  it('no longer renders the page title as an h1', () => {
    const wrapper = mountApp()
    expect(wrapper.find('h1').exists()).toBe(false)
  })
})
