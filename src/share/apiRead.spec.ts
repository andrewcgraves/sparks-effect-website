import { afterEach, describe, expect, it, vi } from 'vitest'
import { anonymousApiRead } from './apiRead'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('anonymousApiRead', () => {
  it('reads JSON from the API base, with no credentials of any kind', async () => {
    const fetch = vi.fn(async () => new Response('[{"slug":"ca-hsr"}]', { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    const body = await anonymousApiRead('https://api.example.app', 1500)('/api/scenarios')

    expect(body).toEqual([{ slug: 'ca-hsr' }])
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.app/api/scenarios')
    expect(init.headers).toEqual({ accept: 'application/json' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.credentials).toBeUndefined()
  })

  it('rejects an answer that is not a success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(anonymousApiRead('https://api.example.app', 1500)('/api/routes')).rejects.toThrow('/api/routes answered 503')
  })

  it('rejects without fetching when no API base is configured', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(anonymousApiRead(undefined, 1500)('/api/scenarios')).rejects.toThrow('VITE_API_BASE_URL is not set')
    expect(fetch).not.toHaveBeenCalled()
  })
})
