// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchServicePublication, publishService, unpublishService } from './publications'
import { ApiError } from './authoring/client'

describe('publications', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetchServicePublication GETs /api/services/{slug}/publication', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ published_at: 'x' }) } as Response)
    await fetchServicePublication('northbound-express')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services/northbound-express/publication')
    expect((init as RequestInit | undefined)?.method ?? 'GET').toBe('GET')
  })

  it('publishService PUTs /api/services/{slug}/publication with no body', async () => {
    const snapshot = { user_service_id: 'svc1', published_at: '2026-09-21T09:00:00Z' }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => snapshot } as Response)
    const result = await publishService('northbound-express')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services/northbound-express/publication')
    expect((init as RequestInit).method).toBe('PUT')
    expect((init as RequestInit).body).toBeUndefined()
    expect(result).toEqual(snapshot)
  })

  it('publishService surfaces stale_graph as its code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'compiled graph is stale', code: 'stale_graph' }),
    } as Response)
    const err = await publishService('northbound-express').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('stale_graph')
  })

  it('unpublishService DELETEs /api/services/{slug}/publication and resolves void', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    const result = await unpublishService('northbound-express')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services/northbound-express/publication')
    expect((init as RequestInit).method).toBe('DELETE')
    expect(result).toBeUndefined()
  })
})
