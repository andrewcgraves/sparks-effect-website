import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useAuthStore } from './stores/auth'

vi.mock('./analytics/index', () => ({
  trackPageView: vi.fn(),
}))

describe('App routing', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    setActivePinia(createPinia())
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

  it('shows a sign-in link when signed out', async () => {
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-authoring"]').exists()).toBe(false)
  })

  it('shows a My authoring link when signed in', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="nav-authoring"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(false)
  })
})
