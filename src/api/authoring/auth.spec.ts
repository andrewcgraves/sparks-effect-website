// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  changePassword,
  fetchAccountToken,
  login,
  logout,
  redeemAccountToken,
  revokeAllSessions,
  updateMe,
} from './auth'

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

describe('fetchAccountToken', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('GETs the link by its token and returns whom it is for', async () => {
    const body = { purpose: 'invite', email: 'new@example.com', expires_at: '2026-10-10T00:00:00Z' }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => body } as Response)

    const result = await fetchAccountToken('tok/with?odd chars')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/auth/tokens/tok%2Fwith%3Fodd%20chars')
    expect((init as RequestInit | undefined)?.method ?? 'GET').toBe('GET')
    expect(result).toEqual(body)
  })

  it('rejects with a 404 ApiError for a link that is no longer valid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'link not found or no longer valid' }),
    } as Response)

    await expect(fetchAccountToken('gone')).rejects.toMatchObject({ status: 404 })
  })
})

describe('redeemAccountToken', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs the new password to the link and returns the session', async () => {
    const body = {
      token: 'session-1',
      expires_at: '2026-10-04T00:00:00Z',
      user: { id: 'u1', email: 'new@example.com', is_admin: false },
    }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => body } as Response)

    const result = await redeemAccountToken('tok-1', 'a-strong-new-password')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/auth/tokens/tok-1')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ password: 'a-strong-new-password' })
    expect(result).toEqual(body)
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
