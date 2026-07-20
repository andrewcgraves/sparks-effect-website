import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../analytics/index', () => ({
  trackPageView: vi.fn(),
}))

vi.mock('../views/CoverPage.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/ScenarioView.vue', () => ({ default: { props: ['slug'], template: '<div />' } }))
vi.mock('../views/LoginView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/AuthoringView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/NotFoundView.vue', () => ({ default: { template: '<div />' } }))

import { router } from './index'
import { trackPageView } from '../analytics/index'
import { useAuthStore } from '../stores/auth'

describe('router', () => {
  beforeEach(() => {
    vi.mocked(trackPageView).mockClear()
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  it('tracks a page view for /', async () => {
    await router.push('/')
    expect(trackPageView).toHaveBeenCalledWith('/')
  })

  it('tracks a page view for /scenario/:slug using the actual route path', async () => {
    await router.push('/scenario/ca-hsr')
    expect(trackPageView).toHaveBeenCalledWith('/scenario/ca-hsr')
  })

  it('tracks a page view for unmatched paths using the actual route path', async () => {
    await router.push('/nope')
    expect(trackPageView).toHaveBeenCalledWith('/nope')
  })

  describe('auth gating', () => {
    it('redirects a signed-out visitor away from /authoring to /login, preserving the destination', async () => {
      await router.push('/authoring')
      expect(router.currentRoute.value.path).toBe('/login')
      expect(router.currentRoute.value.query.redirect).toBe('/authoring')
    })

    it('lets a signed-in user reach /authoring', async () => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
      await router.push('/authoring')
      expect(router.currentRoute.value.path).toBe('/authoring')
    })

    it('redirects a signed-in visitor away from /login to /authoring', async () => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
      await router.push('/login')
      expect(router.currentRoute.value.path).toBe('/authoring')
    })

    it('lets a signed-out visitor reach /login', async () => {
      await router.push('/login')
      expect(router.currentRoute.value.path).toBe('/login')
    })
  })
})
