import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { DefineComponent } from 'vue'
import { Analytics, type BeforeSend } from '@vercel/analytics/vue'
import App from './App.vue'
import { router } from './router'
import { useAuthStore } from './stores/auth'
import { seriousA11yViolations } from './test/axe'

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

  it('shows the site header on an authoring page', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    await router.push('/authoring')
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.find('[data-testid="nav-home"]').exists()).toBe(true)
  })

  it('links Privacy, Terms and Attribution from the footer', async () => {
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    const links = wrapper.findAll('[data-testid="footer-links"] a').map((link) => [link.text(), link.attributes('href')])
    expect(links).toContainEqual(['Privacy', '/privacy'])
    expect(links).toContainEqual(['Terms', '/terms'])
    expect(links).toContainEqual(['Attribution', '/attribution'])
    expect(wrapper.get('[data-testid="agencies-link"]').attributes('href')).toBe('/attribution#transit-schedules')
  })

  it('renders each legal page, dated, to a signed-out visitor', async () => {
    for (const [path, heading] of [['/privacy', 'Privacy policy'], ['/terms', 'Terms of use'], ['/attribution', 'Attribution']]) {
      await router.push(path)
      const wrapper = mount(App, { global: { plugins: [router] } })
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe(heading)
      expect(wrapper.find('[data-testid="page-updated"] time').exists()).toBe(true)
    }
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

  describe('skipping to the content', () => {
    it('offers a skip link before anything else a keyboard can reach', async () => {
      const wrapper = mount(App, { global: { plugins: [router] } })
      await flushPromises()
      const first = wrapper.find('a, button, input, select, textarea')
      expect(first.attributes('data-testid')).toBe('skip-link')
      expect(first.text()).toBe('Skip to content')
      expect(first.attributes('href')).toBe('#content')
    })

    it('moves focus past the header to the page itself', async () => {
      const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
      await flushPromises()
      await wrapper.get('[data-testid="skip-link"]').trigger('click')

      const content = wrapper.get('#content')
      expect(document.activeElement).toBe(content.element)
      expect(content.find('main').exists()).toBe(true)
      expect(router.currentRoute.value.hash).toBe('')
      wrapper.unmount()
    })
  })

  it('has no serious or critical accessibility violations around the page', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: true })
    await router.push('/nope')
    const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })
})
