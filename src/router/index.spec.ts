import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../analytics/index', () => ({
  trackPageView: vi.fn(),
}))

vi.mock('../views/CoverPage.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/ScenarioView.vue', () => ({ default: { props: ['slug'], template: '<div />' } }))
vi.mock('../views/LoginView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/AuthoringView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/ServiceAuthoringView.vue', () => ({ default: { props: ['slug'], template: '<div />' } }))
vi.mock('../views/ScenarioBuilderView.vue', () => ({ default: { props: ['slug'], template: '<div />' } }))
vi.mock('../views/RouteView.vue', () => ({ default: { props: ['slug'], template: '<div />' } }))
vi.mock('../views/AuthoredServiceView.vue', () => ({ default: { props: ['slug'], template: '<div />' } }))
vi.mock('../views/AuthoredScenarioView.vue', () => ({ default: { props: ['slug'], template: '<div />' } }))
vi.mock('../views/PublishedServiceView.vue', () => ({ default: { props: ['slug'], template: '<div />' } }))
vi.mock('../views/NotFoundView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/AdminView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/WelcomeView.vue', () => ({ default: { props: ['token'], template: '<div />' } }))
vi.mock('../views/PrivacyView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/TermsView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/AttributionView.vue', () => ({ default: { template: '<div />' } }))

import type { RouteLocationNormalized } from 'vue-router'
import { router, redirectAfterSessionExpiry } from './index'
import { trackPageView } from '../analytics/index'
import { AUTH_STORAGE_KEY, useAuthStore } from '../stores/auth'

describe('router', () => {
  it('loads cover and not-found eagerly and every other named route on demand', () => {
    const named = router.getRoutes().filter((route) => route.name != null)
    const eager = named
      .filter((route) => typeof route.components?.default !== 'function')
      .map((route) => route.name)
    expect(eager.sort()).toEqual(['cover', 'not-found'])
  })

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

  it('tracks a page view for /routes/:slug using the actual route path', async () => {
    await router.push('/routes/main-line')
    expect(trackPageView).toHaveBeenCalledWith('/routes/main-line')
  })

  it('tracks a page view for unmatched paths using the actual route path', async () => {
    await router.push('/nope')
    expect(trackPageView).toHaveBeenCalledWith('/nope')
  })

  it('opens the privacy, terms and attribution pages to a signed-out visitor', async () => {
    for (const [path, name] of [['/privacy', 'privacy'], ['/terms', 'terms'], ['/attribution', 'attribution']]) {
      await router.push(path)
      expect(router.currentRoute.value.name).toBe(name)
      expect(trackPageView).toHaveBeenCalledWith(path)
    }
  })

  describe('scroll position', () => {
    const scrollBehavior = router.options.scrollBehavior!
    const at = (path: string) => router.resolve(path) as RouteLocationNormalized

    it('opens a new page at the top', async () => {
      expect(await scrollBehavior(at('/privacy'), at('/'), null)).toEqual({ top: 0 })
    })

    it('scrolls to an anchor, as the footer\'s link to the transit agencies does', async () => {
      expect(await scrollBehavior(at('/attribution#transit-schedules'), at('/'), null)).toEqual({ el: '#transit-schedules' })
    })

    it('stays put when only the query changes, as a plot does', async () => {
      const from = at('/scenario/ca-hsr')
      const to = at('/scenario/ca-hsr?at=37.3,-121.8&mode=walk&mins=60')
      expect(await scrollBehavior(to, from, null)).toBe(false)
    })

    it('returns to where the visitor was on back and forward', async () => {
      expect(await scrollBehavior(at('/'), at('/privacy'), { left: 0, top: 640 })).toEqual({ left: 0, top: 640 })
    })
  })

  it('does not count a query change on the same page as another page view', async () => {
    await router.push('/scenario/ca-hsr')
    vi.mocked(trackPageView).mockClear()
    await router.replace({ query: { at: '37.3,-121.8', mode: 'walk', mins: '60' } })
    expect(trackPageView).not.toHaveBeenCalled()
  })

  describe('set-password links', () => {
    it('opens the set-password page for a /welcome/:token link', async () => {
      await router.push('/welcome/secret-token')
      expect(router.currentRoute.value.name).toBe('welcome')
      expect(router.currentRoute.value.params.token).toBe('secret-token')
    })

    it('records the page view as /welcome, keeping the token out of analytics', async () => {
      await router.push('/')
      await router.push('/welcome/secret-token')
      expect(trackPageView).toHaveBeenCalledWith('/welcome')
      expect(JSON.stringify(vi.mocked(trackPageView).mock.calls)).not.toContain('secret-token')
    })

    it('forwards the link the API issues, /set-password?token=, to the same page', async () => {
      await router.push('/set-password?token=secret-token')
      expect(router.currentRoute.value.name).toBe('welcome')
      expect(router.currentRoute.value.params.token).toBe('secret-token')
      expect(router.currentRoute.value.query).toEqual({})
      expect(JSON.stringify(vi.mocked(trackPageView).mock.calls)).not.toContain('secret-token')
    })

    it('sends a /set-password link with no token to sign in', async () => {
      await router.push('/set-password')
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('lets a signed-in user open a link, so the page can check whose it is', async () => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
      await router.push('/welcome/secret-token')
      expect(router.currentRoute.value.name).toBe('welcome')
    })
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

    it('gates the authored-service detail page behind sign-in', async () => {
      await router.push('/authoring/services/northbound-express')
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('gates editing an authored service behind sign-in', async () => {
      await router.push('/authoring/services/northbound-express/edit')
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('gates editing an authored scenario behind sign-in', async () => {
      await router.push('/authoring/scenarios/ca-hsr/edit')
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('gates the authored-scenario detail page behind sign-in', async () => {
      await router.push('/authoring/scenarios/ca-hsr')
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('lets a signed-out visitor open a published service', async () => {
      await router.push('/services/northbound-express')
      expect(router.currentRoute.value.name).toBe('published-service')
      expect(router.currentRoute.value.params.slug).toBe('northbound-express')
    })
  })

  describe('admin gating', () => {
    // The router is shared, and a push to the route it is already on skips the
    // guard; start every case from elsewhere.
    beforeEach(async () => {
      await router.push('/')
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('sends a signed-out visitor to sign in first', async () => {
      await router.push('/admin')
      expect(router.currentRoute.value.path).toBe('/login')
      expect(router.currentRoute.value.query.redirect).toBe('/admin')
    })

    it('sends a signed-in non-admin home', async () => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: false })
      await router.push('/admin')
      expect(router.currentRoute.value.path).toBe('/')
    })

    it('lets an admin in', async () => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: true })
      await router.push('/admin')
      expect(router.currentRoute.value.path).toBe('/admin')
    })

    it('waits for a restored session to say who the user is before deciding', async () => {
      // A reload: the token comes back from storage but the user record is
      // still on its way from /api/auth/me.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'u1', email: 'a@example.com', is_admin: true }),
      } as Response))
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'tok-1', userId: 'u1' }))
      setActivePinia(createPinia())

      await router.push('/admin')

      expect(router.currentRoute.value.path).toBe('/admin')
    })

    it('sends a restored non-admin home once /api/auth/me answers', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'u1', email: 'a@example.com', is_admin: false }),
      } as Response))
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'tok-1', userId: 'u1' }))
      setActivePinia(createPinia())

      await router.push('/admin')

      expect(router.currentRoute.value.path).toBe('/')
    })
  })

  describe('authored detail routes', () => {
    beforeEach(() => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    })

    it('passes the slug to the authored-service view', async () => {
      await router.push('/authoring/services/northbound-express')
      expect(router.currentRoute.value.name).toBe('service-detail')
      expect(router.currentRoute.value.params.slug).toBe('northbound-express')
    })

    it('passes the slug to the authored-scenario view', async () => {
      await router.push('/authoring/scenarios/ca-hsr')
      expect(router.currentRoute.value.name).toBe('scenario-detail')
      expect(router.currentRoute.value.params.slug).toBe('ca-hsr')
    })

    it('passes the slug to the service editor', async () => {
      await router.push('/authoring/services/northbound-express/edit')
      expect(router.currentRoute.value.name).toBe('edit-service')
      expect(router.currentRoute.value.params.slug).toBe('northbound-express')
    })

    it('passes the slug to the scenario builder for editing', async () => {
      await router.push('/authoring/scenarios/ca-hsr/edit')
      expect(router.currentRoute.value.name).toBe('edit-scenario')
      expect(router.currentRoute.value.params.slug).toBe('ca-hsr')
    })

    it('keeps the new-service form ahead of the slug route', async () => {
      await router.push('/authoring/services/new')
      expect(router.currentRoute.value.name).toBe('new-service')
    })

    it('keeps the new-scenario builder ahead of the slug route', async () => {
      await router.push('/authoring/scenarios/new')
      expect(router.currentRoute.value.name).toBe('new-scenario')
    })
  })

  describe('document title', () => {
    it('names a static page, suffixed with the site name', async () => {
      await router.push('/login')
      expect(document.title).toBe('Sign in · Sparks Effect')
    })

    it('names the legal pages', async () => {
      await router.push('/privacy')
      expect(document.title).toBe('Privacy policy · Sparks Effect')
      await router.push('/terms')
      expect(document.title).toBe('Terms of use · Sparks Effect')
      await router.push('/attribution')
      expect(document.title).toBe('Attribution · Sparks Effect')
    })

    it('names the signed-in pages', async () => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
      await router.push('/authoring')
      expect(document.title).toBe('My authoring · Sparks Effect')
      await router.push('/authoring/services/new')
      expect(document.title).toBe('New line · Sparks Effect')
      await router.push('/authoring/scenarios/new')
      expect(document.title).toBe('New network · Sparks Effect')
    })

    it('tells an owner\'s draft apart from its public page before either loads', async () => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
      await router.push('/authoring/services/northbound-express')
      expect(document.title).toBe('My line · Sparks Effect')
      await router.push('/services/northbound-express')
      expect(document.title).toBe('Line · Sparks Effect')
      await router.push('/authoring/scenarios/ca-hsr')
      expect(document.title).toBe('My network · Sparks Effect')
      await router.push('/scenario/ca-hsr')
      expect(document.title).toBe('Network · Sparks Effect')
    })

    it('names an edit page by what it edits before the draft loads', async () => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
      await router.push('/authoring/services/northbound-express/edit')
      expect(document.title).toBe('Edit line · Sparks Effect')
      await router.push('/authoring/scenarios/ca-hsr/edit')
      expect(document.title).toBe('Edit network · Sparks Effect')
    })

    it('names an unmatched path as not found', async () => {
      await router.push('/no-such-page')
      expect(document.title).toBe('Page not found · Sparks Effect')
    })

    it('keeps the page\'s own title when only the query changes', async () => {
      await router.push('/scenario/ca-hsr')
      document.title = 'California HSR · Sparks Effect'
      await router.replace({ query: { at: '37.3,-121.8', mode: 'walk', mins: '60' } })
      expect(document.title).toBe('California HSR · Sparks Effect')
    })

    it('drops one public page\'s own title on navigating to the next, and back to /', async () => {
      await router.push('/scenario/ca-hsr')
      document.title = 'California HSR · Sparks Effect'
      await router.push('/services/northbound-express')
      expect(document.title).toBe('Line · Sparks Effect')
      document.title = 'Northbound Express · Sparks Effect'
      await router.push('/routes/main-line')
      expect(document.title).toBe('Route · Sparks Effect')
      document.title = 'Main Line · Sparks Effect'
      await router.push('/')
      expect(document.title).toBe('Sparks Effect')
    })

    it('restores the bare site name on returning to /', async () => {
      await router.push('/login')
      await router.push('/')
      expect(document.title).toBe('Sparks Effect')
    })
  })

  describe('after the session expires', () => {
    it('sends the user from an authoring page to sign in, remembering where they were', async () => {
      const auth = useAuthStore()
      auth.signIn('tok-1', { id: 'u1' })
      await router.push('/authoring/services/northbound-express?tab=stops')

      auth.expireSession()
      await redirectAfterSessionExpiry(router)

      expect(router.currentRoute.value.path).toBe('/login')
      expect(router.currentRoute.value.query.redirect).toBe('/authoring/services/northbound-express?tab=stops')
    })

    it('leaves a visitor on a public page where they are', async () => {
      const auth = useAuthStore()
      auth.signIn('tok-1', { id: 'u1' })
      await router.push('/scenario/ca-hsr')

      auth.expireSession()
      await redirectAfterSessionExpiry(router)

      expect(router.currentRoute.value.path).toBe('/scenario/ca-hsr')
    })
  })
})
