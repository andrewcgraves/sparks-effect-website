import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { DefineComponent } from 'vue'
import { Analytics, type BeforeSend } from '@vercel/analytics/vue'
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
    expect(wrapper.text()).toContain('Sparks Effect')
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

  it('sends a signed-out visitor to /account through sign-in, and back', async () => {
    await router.push('/account')
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/account')
  })

  it('opens the account page when signed in', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    await router.push('/account')
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/account')
    expect(wrapper.find('h1').text()).toBe('Account')
  })

  it('shows an Admin link to an admin', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: true })
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.get('[data-testid="nav-admin"]').attributes('href')).toBe('/admin')
  })

  it('shows no Admin link to a signed-in non-admin, or while signed out', async () => {
    const signedOut = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(signedOut.find('[data-testid="nav-admin"]').exists()).toBe(false)

    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: false })
    const member = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(member.find('[data-testid="nav-admin"]').exists()).toBe(false)
  })

  it('links How it works from the header, signed in or out', async () => {
    const signedOut = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(signedOut.get('header [data-testid="nav-how-it-works"]').attributes('href')).toBe('/how-it-works')

    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    const signedIn = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(signedIn.get('header [data-testid="nav-how-it-works"]').attributes('href')).toBe('/how-it-works')
  })

  it('links How it works from the footer', async () => {
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    const links = wrapper.findAll('[data-testid="footer-links"] a')
    expect(links.map((link) => [link.text(), link.attributes('href')])).toContainEqual(['How it works', '/how-it-works'])
  })

  it('renders the How it works page at /how-it-works', async () => {
    await router.push('/how-it-works')
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('How it works')
    expect(wrapper.find('[data-testid="how-it-works-diagram"]').exists()).toBe(true)
  })

  it('hosts the shared confirm dialog and toast region on every page', async () => {
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="toast-region"]').exists()).toBe(true)
  })

  it('ends the cover page with the one site footer', async () => {
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.findAll('footer')).toHaveLength(1)
    expect(wrapper.find('[data-testid="build-version"]').exists()).toBe(true)
  })

  it('ends the not-found page with the site footer', async () => {
    await router.push('/nope')
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="build-version"]').exists()).toBe(true)
  })

  it('keeps a set-password token out of the page views Vercel Analytics reports', async () => {
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    // @vercel/analytics/vue types `Analytics` as `any`, which @vue/test-utils
    // 2.5 resolves to its DOM-selector overload; name it as the component it is.
    const AnalyticsComponent = Analytics as DefineComponent<{ beforeSend: BeforeSend }>
    const beforeSend = wrapper.findComponent(AnalyticsComponent).props('beforeSend')

    expect(beforeSend({ type: 'pageview', url: 'https://sparks.example/welcome/secret-token' }))
      .toEqual({ type: 'pageview', url: 'https://sparks.example/welcome' })
  })
})
