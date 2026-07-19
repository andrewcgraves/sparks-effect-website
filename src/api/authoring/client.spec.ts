import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBase, apiRequest } from './client'

describe('apiBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to localhost:8080', () => {
    expect(apiBase()).toBe('http://localhost:8080')
  })

  it('uses VITE_API_BASE_URL when set', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://custom-api:9000')
    expect(apiBase()).toBe('http://custom-api:9000')
  })
})

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('prefixes the base URL to the path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response)
    await apiRequest('/api/things')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toBe('http://localhost:8080/api/things')
  })

  it('does not set Content-Type when there is no body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response)
    await apiRequest('/api/things')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('sets Content-Type when there is a body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response)
    await apiRequest('/api/things', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('does not clobber a caller-provided Content-Type', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response)
    await apiRequest('/api/things', {
      method: 'POST',
      body: 'raw',
      headers: { 'Content-Type': 'text/plain' },
    })
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('Content-Type')).toBe('text/plain')
  })

  it('parses JSON on a 200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: 1 }) } as Response)
    const result = await apiRequest<{ ok: number }>('/api/things')
    expect(result).toEqual({ ok: 1 })
  })

  it('returns undefined on a 204 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    const result = await apiRequest('/api/things', { method: 'DELETE' })
    expect(result).toBeUndefined()
  })

  it('throws with method, path, and status on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not found' }),
    } as Response)
    await expect(apiRequest('/api/things/x', { method: 'GET' })).rejects.toThrow(
      /GET \/api\/things\/x failed: 404: not found/,
    )
  })

  it('still throws when the error body is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json')
      },
    } as unknown as Response)
    await expect(apiRequest('/api/things')).rejects.toThrow(/GET \/api\/things failed: 500/)
  })
})
