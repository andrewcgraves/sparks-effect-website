// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setAuthTokenProvider } from './authoring/client'
import { listPublishedServices, type PublishedServiceSummary } from './publications'

const published: PublishedServiceSummary[] = [
  { slug: 'coast-line', name: 'Coast Line', subtext: 'Electrified · Regional rail', description: 'A line.' },
  { slug: 'bare-line', name: 'Bare Line' },
]

describe('listPublishedServices', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    setAuthTokenProvider(null)
    vi.restoreAllMocks()
  })

  it('reads the public index, not the caller’s own services', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => published } as Response)

    const result = await listPublishedServices()

    expect(new URL(vi.mocked(fetch).mock.calls[0][0] as string).pathname).toBe('/api/published-services')
    expect(result).toEqual(published)
  })

  it('needs no session', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)

    await listPublishedServices()

    const headers = new Headers((vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('rejects when the read fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response)
    await expect(listPublishedServices()).rejects.toBeInstanceOf(ApiError)
  })
})
