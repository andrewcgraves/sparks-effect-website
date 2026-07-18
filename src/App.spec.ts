import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'
import { router } from './router'

vi.mock('./analytics/index', () => ({
  trackPageView: vi.fn(),
}))

describe('App routing', () => {
  beforeEach(async () => {
    await router.push('/')
    await router.isReady()
  })

  it('renders the cover page at /', async () => {
    await router.push('/')
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Hello')
  })

  it('renders the not-found view for an unmatched path', async () => {
    await router.push('/nope')
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Page not found')
  })
})
