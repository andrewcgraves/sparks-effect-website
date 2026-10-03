// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './authoring/client'
import { createInvite, createResetLink, listUsers, updateUser, type AdminUser } from './admin'

const ada: AdminUser = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  is_admin: true,
  created_at: '2026-09-01T10:00:00Z',
  disabled_at: null,
  service_count: 3,
  published_count: 1,
}

function respond(status: number, body: unknown): void {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: status < 400, status, json: async () => body } as Response)
}

function sent(): { url: string; init: RequestInit } {
  const [url, init] = vi.mocked(fetch).mock.calls[0]
  return { url: url as string, init: (init ?? {}) as RequestInit }
}

describe('admin API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists every account from /api/admin/users', async () => {
    respond(200, [ada])

    const users = await listUsers()

    expect(new URL(sent().url).pathname).toBe('/api/admin/users')
    expect(users).toEqual([ada])
  })

  it('patches only the flag being changed', async () => {
    respond(200, { ...ada, is_admin: false })

    await updateUser('u1', { is_admin: false })

    const { url, init } = sent()
    expect(new URL(url).pathname).toBe('/api/admin/users/u1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ is_admin: false })
  })

  it('rejects with the API’s 409 when an admin changes their own access', async () => {
    respond(409, { error: 'an admin cannot demote themselves' })

    const failure = await updateUser('u1', { is_admin: false }).catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 409 })
  })

  it('invites by email, name and admin flag, answering the new account and its link', async () => {
    const answer = { user: { id: 'u2', email: 'bo@example.com', name: 'Bo', is_admin: false }, url: 'https://x/set-password?token=t' }
    respond(201, answer)

    const result = await createInvite({ email: 'bo@example.com', name: 'Bo', is_admin: false })

    const { url, init } = sent()
    expect(new URL(url).pathname).toBe('/api/admin/invites')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'bo@example.com', name: 'Bo', is_admin: false })
    expect(result).toEqual(answer)
  })

  it('issues a reset link for one account', async () => {
    respond(201, { url: 'https://x/set-password?token=r' })

    const result = await createResetLink('u2')

    const { url, init } = sent()
    expect(new URL(url).pathname).toBe('/api/admin/users/u2/reset-link')
    expect(init.method).toBe('POST')
    expect(result).toEqual({ url: 'https://x/set-password?token=r' })
  })

  it('escapes the id into the path', async () => {
    respond(201, { url: 'u' })

    await createResetLink('a/b')

    expect(new URL(sent().url).pathname).toBe('/api/admin/users/a%2Fb/reset-link')
  })
})
