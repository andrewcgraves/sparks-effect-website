import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { getActivePinia } from 'pinia'
import { installStores, useAuthStore, useDraftsStore, draftsStorageKey } from './index'
import { apiRequest, setAuthTokenProvider, setUnauthorizedHandler } from '../api/authoring'

const Noop = defineComponent({ render: () => h('div') })

describe('installStores', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    setAuthTokenProvider(null)
    setUnauthorizedHandler(null)
    vi.restoreAllMocks()
  })

  it('makes stores usable inside the app', () => {
    const app = createApp(Noop)
    installStores(app)
    app.mount(document.createElement('div'))
    expect(getActivePinia()).toBeDefined()
    expect(useAuthStore().isAuthenticated).toBe(false)
    app.unmount()
  })

  it('feeds the auth store token into API requests', async () => {
    const app = createApp(Noop)
    installStores(app)
    app.mount(document.createElement('div'))

    useAuthStore().signIn('tok-1', { id: 'u1' })

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    await apiRequest('/api/services')

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok-1')
    app.unmount()
  })

  it('rehydrates a persisted session on boot', async () => {
    const me = { id: 'u1', email: 'a@example.com' }
    window.localStorage.setItem('sparks-effect.auth', JSON.stringify({ token: 'tok-1' }))
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => me } as Response)

    const app = createApp(Noop)
    installStores(app)
    app.mount(document.createElement('div'))

    // The boot fetch is fire-and-forget, so let it settle.
    await vi.waitFor(() => expect(useAuthStore().user).toEqual(me))
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/auth/me')
    app.unmount()
  })

  it('does not fetch identity when there is no persisted token', () => {
    const app = createApp(Noop)
    installStores(app)
    app.mount(document.createElement('div'))
    expect(fetch).not.toHaveBeenCalled()
    app.unmount()
  })

  it('stops sending the token after sign-out', async () => {
    const app = createApp(Noop)
    installStores(app)
    app.mount(document.createElement('div'))

    const auth = useAuthStore()
    auth.signIn('tok-1', { id: 'u1' })
    auth.signOut()

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    await apiRequest('/api/services')

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
    app.unmount()
  })

  describe('when the session expires mid-use', () => {
    const unauthorized = () => ({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) }) as Response

    function mountSignedIn(onSessionExpired = vi.fn()) {
      const app = createApp(Noop)
      installStores(app, { onSessionExpired })
      app.mount(document.createElement('div'))
      useAuthStore().signIn('tok-1', { id: 'u1' })
      return { app, onSessionExpired }
    }

    it('signs out locally, flags the expiry, and reports it', async () => {
      const { app, onSessionExpired } = mountSignedIn()
      vi.mocked(fetch).mockResolvedValueOnce(unauthorized())

      await apiRequest('/api/services').catch(() => {})

      const auth = useAuthStore()
      expect(auth.isAuthenticated).toBe(false)
      expect(auth.sessionExpired).toBe(true)
      expect(window.localStorage.getItem('sparks-effect.auth')).toBeNull()
      expect(onSessionExpired).toHaveBeenCalledOnce()
      app.unmount()
    })

    it('does not call the server logout endpoint', async () => {
      const { app } = mountSignedIn()
      vi.mocked(fetch).mockResolvedValueOnce(unauthorized())

      await apiRequest('/api/services').catch(() => {})

      expect(fetch).toHaveBeenCalledOnce()
      app.unmount()
    })

    it('reports two concurrent 401s once', async () => {
      const { app, onSessionExpired } = mountSignedIn()
      vi.mocked(fetch).mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized())

      await Promise.allSettled([apiRequest('/api/services'), apiRequest('/api/scenarios')])

      expect(onSessionExpired).toHaveBeenCalledOnce()
      app.unmount()
    })

    it('ignores a late 401 for a token that has since been replaced', async () => {
      const { app, onSessionExpired } = mountSignedIn()
      let answer: (res: Response) => void = () => {}
      vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>((resolve) => { answer = resolve }))

      const stale = apiRequest('/api/services').catch(() => {})
      useAuthStore().signIn('tok-2', { id: 'u1' })
      answer(unauthorized())
      await stale

      expect(useAuthStore().token).toBe('tok-2')
      expect(onSessionExpired).not.toHaveBeenCalled()
      app.unmount()
    })

    it('keeps the unsaved draft, and restores it when the same user signs back in', async () => {
      const { app } = mountSignedIn()
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.patchServiceDraft({ name: 'Night owl' })
      await nextTick()

      vi.mocked(fetch).mockResolvedValueOnce(unauthorized())
      await apiRequest('/api/services', { method: 'PUT', body: '{}' }).catch(() => {})
      await nextTick()

      expect(drafts.serviceDraft).toBeNull()
      expect(window.localStorage.getItem(draftsStorageKey('u1'))).toContain('Night owl')

      useAuthStore().signIn('tok-2', { id: 'u1' })
      await nextTick()
      expect(drafts.serviceDraft?.name).toBe('Night owl')
      expect(useAuthStore().sessionExpired).toBe(false)
      app.unmount()
    })

    it('does not treat a deliberate sign-out with an already-dead token as an expiry', async () => {
      const { app, onSessionExpired } = mountSignedIn()
      vi.mocked(fetch).mockResolvedValueOnce(unauthorized())

      await useAuthStore().logout()

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer tok-1')
      expect(useAuthStore().isAuthenticated).toBe(false)
      expect(useAuthStore().sessionExpired).toBe(false)
      expect(onSessionExpired).not.toHaveBeenCalled()
      app.unmount()
    })

    it('is not triggered by a public request made while signed out', async () => {
      const onSessionExpired = vi.fn()
      const app = createApp(Noop)
      installStores(app, { onSessionExpired })
      app.mount(document.createElement('div'))
      vi.mocked(fetch).mockResolvedValueOnce(unauthorized())

      await apiRequest('/api/isochrone', { method: 'POST', body: '{}' }).catch(() => {})

      expect(onSessionExpired).not.toHaveBeenCalled()
      expect(useAuthStore().sessionExpired).toBe(false)
      app.unmount()
    })
  })
})
