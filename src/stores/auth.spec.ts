import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore, AUTH_STORAGE_KEY } from './auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
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

  it('persists the session so it survives a reload', () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })

    // A fresh Pinia stands in for a page reload.
    setActivePinia(createPinia())
    const restored = useAuthStore()
    expect(restored.token).toBe('tok-1')
    expect(restored.user).toEqual({ id: 'u1', email: 'a@example.com' })
    expect(restored.isAuthenticated).toBe(true)
  })

  it('signOut clears both state and persisted session', () => {
    const auth = useAuthStore()
    auth.signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    auth.signOut()

    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('treats an empty token as signed out, matching what it will persist', () => {
    const auth = useAuthStore()
    auth.signIn('')
    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('ignores a corrupt persisted session rather than throwing', () => {
    localStorage.setItem(AUTH_STORAGE_KEY, 'not json')
    setActivePinia(createPinia())
    const auth = useAuthStore()
    expect(auth.token).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('ignores a persisted session that has no token', () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: { id: 'u1' } }))
    setActivePinia(createPinia())
    expect(useAuthStore().isAuthenticated).toBe(false)
  })

  it('survives localStorage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    const auth = useAuthStore()
    expect(() => auth.signIn('tok-1', { id: 'u1', email: 'a@example.com' })).not.toThrow()
    expect(auth.isAuthenticated).toBe(true)
  })
})
