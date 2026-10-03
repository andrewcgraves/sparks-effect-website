// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changePassword, login, logout, revokeAllSessions, updateMe } from './auth'

describe('login', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs credentials to /api/auth/login and returns the session', async () => {
    const body = {
      token: 'tok-1',
      expires_at: '2026-07-21T00:00:00Z',
      user: { id: 'u1', email: 'a@example.com', is_admin: false },
    }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => body } as Response)

    const result = await login('a@example.com', 'secret')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/auth/login')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: 'a@example.com',
      password: 'secret',
    })
    expect(result).toEqual(body)
  })

  it('rejects with an ApiError on invalid credentials', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid email or password' }),
    } as Response)

    await expect(login('a@example.com', 'wrong')).rejects.toThrow(/401/)
  })
})

describe('logout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs to /api/auth/logout', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)

    await logout()

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/auth/logout')
    expect((init as RequestInit).method).toBe('POST')
  })
})

describe('updateMe', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('PATCHes only the name to /api/auth/me and returns the updated user', async () => {
    const user = { id: 'u1', email: 'a@example.com', name: 'Ada' }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => user } as Response)

    const result = await updateMe('Ada')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/auth/me')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'Ada' })
    expect(result).toEqual(user)
  })
})

describe('changePassword', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs both passwords to /api/auth/password with the given token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)

    await changePassword('old-password', 'a-new-password', 'tok-1')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/auth/password')
    expect((init as RequestInit).method).toBe('POST')
    expect(new Headers((init as RequestInit).headers).get('Authorization')).toBe('Bearer tok-1')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      current_password: 'old-password',
      new_password: 'a-new-password',
    })
  })
})

describe('revokeAllSessions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs to /api/auth/sessions/revoke-all', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)

    await revokeAllSessions()

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/auth/sessions/revoke-all')
    expect((init as RequestInit).method).toBe('POST')
  })
})
