import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore, AUTH_STORAGE_KEY } from './auth'
import { ApiError } from '../api/authoring'

describe('useAuthStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts signed out', () => {
    const auth = useAuthStore()
    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('signIn records the session and marks the user authenticated', () => {
    const auth = useAuthStore()
    auth.signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    expect(auth.token).toBe('tok-1')
    expect(auth.user).toEqual({ id: 'u1', email: 'a@example.com' })
    expect(auth.isAuthenticated).toBe(true)
  })

  it('persists the token so it survives a reload', () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })

    // A fresh Pinia stands in for a page reload.
    setActivePinia(createPinia())
    const restored = useAuthStore()
    expect(restored.token).toBe('tok-1')
    expect(restored.isAuthenticated).toBe(true)
  })

  it('does not persist the user, so it cannot go stale across a reload', () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: true })
    expect(JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) as string)).toEqual({ token: 'tok-1' })

    setActivePinia(createPinia())
    expect(useAuthStore().user).toBeNull()
  })

  it('signOut clears both state and persisted session', () => {
    const auth = useAuthStore()
    auth.signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    auth.signOut()

    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('treats an empty token as signed out, matching what it will persist', () => {
    const auth = useAuthStore()
    auth.signIn('')
    expect(auth.isAuthenticated).toBe(false)
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('ignores a corrupt persisted session rather than throwing', () => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, 'not json')
    setActivePinia(createPinia())
    const auth = useAuthStore()
    expect(auth.token).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('ignores a persisted session that has no token', () => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: { id: 'u1' } }))
    setActivePinia(createPinia())
    expect(useAuthStore().isAuthenticated).toBe(false)
  })

  describe('restoreSession', () => {
    it('rehydrates the user behind a persisted token', async () => {
      const me = { id: 'u1', email: 'a@example.com', is_admin: false }
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => me } as Response)

      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'tok-1' }))
      setActivePinia(createPinia())
      const auth = useAuthStore()
      await auth.restoreSession()

      expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/auth/me')
      expect(auth.user).toEqual(me)
      expect(auth.isAuthenticated).toBe(true)
    })

    it('makes no request when there is no token', async () => {
      await useAuthStore().restoreSession()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('signs out when the API rejects the token as expired', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'session expired' }),
      } as Response)

      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'stale' }))
      setActivePinia(createPinia())
      const auth = useAuthStore()
      await auth.restoreSession()

      expect(auth.isAuthenticated).toBe(false)
      expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    })

    it('keeps the session when the failure is transient rather than a 401', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))

      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'tok-1' }))
      setActivePinia(createPinia())
      const auth = useAuthStore()
      await auth.restoreSession()

      expect(auth.isAuthenticated).toBe(true)
      expect(auth.user).toBeNull()
    })

    it('keeps the session when the API is erroring, not rejecting the token', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
      } as Response)

      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'tok-1' }))
      setActivePinia(createPinia())
      const auth = useAuthStore()
      await auth.restoreSession()

      expect(auth.isAuthenticated).toBe(true)
    })

    it('surfaces a 401 as an ApiError carrying the status', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'nope' }),
      } as Response)
      const { fetchCurrentUser } = await import('../api/authoring')
      await expect(fetchCurrentUser()).rejects.toBeInstanceOf(ApiError)
    })
  })

  it('survives localStorage being unavailable', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    const auth = useAuthStore()
    expect(() => auth.signIn('tok-1', { id: 'u1', email: 'a@example.com' })).not.toThrow()
    expect(auth.isAuthenticated).toBe(true)
  })
})
