import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, logout } from './auth'

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
