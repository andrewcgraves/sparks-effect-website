/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as robotsGet, HEAD as robotsHead } from '../api/robots'
import { GET as sitemapGet, HEAD as sitemapHead } from '../api/sitemap'

const API = 'https://api.example.app'

function stubApi(answers: Record<string, unknown>): string[] {
  const reads: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    reads.push(url)
    const path = url.slice(API.length)
    if (!(path in answers)) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(answers[path]), { status: 200 })
  }))
  return reads
}

function locs(xml: string): string[] {
  return [...new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('loc')].map((loc) => loc.textContent ?? '')
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', API)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('api/robots', () => {
  it('answers plain text naming the sitemap absolutely, on the origin of the request', async () => {
    const res = robotsGet(new Request('https://dev.sparks-effect.app/robots.txt'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    const body = await res.text()
    expect(body).toContain('\nSitemap: https://dev.sparks-effect.app/sitemap.xml\n')
    expect(body).toContain('\nDisallow: /api/\n')
  })

  it('answers HEAD as it answers GET', () => {
    expect(robotsHead).toBe(robotsGet)
  })
})

describe('api/sitemap', () => {
  const SERVICES = { items: [{ slug: 'northbound-express', published_at: '2026-09-30T17:04:05Z' }], next_cursor: null }

  it('answers XML on the origin of the request, kept for an hour when every list was read', async () => {
    const reads = stubApi({
      '/api/scenarios': [{ slug: 'ca-hsr' }],
      '/api/routes': [{ slug: 'main-line' }],
      '/api/published-services?cursor=&limit=100': SERVICES,
    })

    const res = await sitemapGet(new Request('https://sparks-effect.app/sitemap.xml'))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
    expect(reads.every((url) => url.startsWith(`${API}/api/`))).toBe(true)
    expect(locs(await res.text())).toEqual([
      'https://sparks-effect.app/',
      'https://sparks-effect.app/scenario/ca-hsr',
      'https://sparks-effect.app/routes/main-line',
      'https://sparks-effect.app/services/northbound-express',
    ])
  })

  it('keeps a sitemap missing a list for minutes, not the hour', async () => {
    stubApi({ '/api/scenarios': [{ slug: 'ca-hsr' }], '/api/routes': [] })
    const res = await sitemapGet(new Request('https://sparks-effect.app/sitemap.xml'))
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300')
    expect(locs(await res.text())).toEqual(['https://sparks-effect.app/', 'https://sparks-effect.app/scenario/ca-hsr'])
  })

  it('answers the cover page alone when the API is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const res = await sitemapGet(new Request('https://dev.sparks-effect.app/sitemap.xml'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300')
    expect(locs(await res.text())).toEqual(['https://dev.sparks-effect.app/'])
  })

  it('answers HEAD as it answers GET', () => {
    expect(sitemapHead).toBe(sitemapGet)
  })
})
