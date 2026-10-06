import { describe, expect, it } from 'vitest'
import type { ApiRead } from './apiRead'
import { renderSitemap } from './sitemap'

const SCENARIOS = [{ id: 's1', slug: 'ca-hsr', name: 'California HSR', description: '' }]
const ROUTES = [{ slug: 'main-line', name: 'Main Line', mode: 'rail' }]
const SERVICES = {
  items: [
    { slug: 'northbound-express', name: 'Northbound Express', author_name: 'Ada', published_at: '2026-09-30T17:04:05.123Z' },
    { slug: 'harbour-loop', name: 'Harbour Loop', author_name: 'Grace', published_at: '2026-08-01T09:00:00-07:00' },
  ],
  next_cursor: null,
}

function api(answers: Record<string, unknown>): { read: ApiRead; reads: string[] } {
  const reads: string[] = []
  const read: ApiRead = async (path) => {
    reads.push(path)
    if (!(path in answers)) throw new Error(`${path} answered 404`)
    const answer = answers[path]
    if (answer instanceof Error) throw answer
    return answer
  }
  return { read, reads }
}

const FIRST_SERVICES_PAGE = '/api/published-services?cursor=&limit=100'

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

function entries(xml: string): { loc: string; lastmod: string | null }[] {
  return [...parse(xml).getElementsByTagName('url')].map((url) => ({
    loc: url.getElementsByTagName('loc')[0]?.textContent ?? '',
    lastmod: url.getElementsByTagName('lastmod')[0]?.textContent ?? null,
  }))
}

describe('renderSitemap', () => {
  it('lists the cover page, every curated scenario and route, and every published service on the requesting host', async () => {
    const { read, reads } = api({
      '/api/scenarios': SCENARIOS,
      '/api/routes': ROUTES,
      [FIRST_SERVICES_PAGE]: SERVICES,
    })

    const { xml, complete } = await renderSitemap('https://sparks-effect.app', read)

    expect(complete).toBe(true)
    expect(reads.sort()).toEqual(['/api/published-services?cursor=&limit=100', '/api/routes', '/api/scenarios'])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true)
    expect(entries(xml)).toEqual([
      { loc: 'https://sparks-effect.app/', lastmod: null },
      { loc: 'https://sparks-effect.app/scenario/ca-hsr', lastmod: null },
      { loc: 'https://sparks-effect.app/routes/main-line', lastmod: null },
      { loc: 'https://sparks-effect.app/services/northbound-express', lastmod: '2026-09-30T17:04:05.123Z' },
      { loc: 'https://sparks-effect.app/services/harbour-loop', lastmod: '2026-08-01T16:00:00.000Z' },
    ])
  })

  it('names whichever host asked, so a build promoted from staging names production', async () => {
    const { read } = api({ '/api/scenarios': SCENARIOS, '/api/routes': [], [FIRST_SERVICES_PAGE]: SERVICES })
    const { xml } = await renderSitemap('https://dev.sparks-effect.app', read)
    for (const { loc } of entries(xml)) expect(loc.startsWith('https://dev.sparks-effect.app/')).toBe(true)
  })

  it('follows next_cursor through every page of published services', async () => {
    const { read, reads } = api({
      '/api/scenarios': [],
      '/api/routes': [],
      [FIRST_SERVICES_PAGE]: { items: [SERVICES.items[0]], next_cursor: 'abc' },
      '/api/published-services?cursor=abc&limit=100': { items: [SERVICES.items[1]], next_cursor: null },
    })

    const { xml, complete } = await renderSitemap('https://sparks-effect.app', read)

    expect(complete).toBe(true)
    expect(reads).toContain('/api/published-services?cursor=abc&limit=100')
    expect(entries(xml).map(({ loc }) => loc)).toEqual([
      'https://sparks-effect.app/',
      'https://sparks-effect.app/services/northbound-express',
      'https://sparks-effect.app/services/harbour-loop',
    ])
  })

  it('stops paging on a cursor that repeats rather than reading forever', async () => {
    const { read, reads } = api({
      '/api/scenarios': [],
      '/api/routes': [],
      [FIRST_SERVICES_PAGE]: { items: [SERVICES.items[0]], next_cursor: 'abc' },
      '/api/published-services?cursor=abc&limit=100': { items: [SERVICES.items[1]], next_cursor: 'abc' },
    })
    const { xml } = await renderSitemap('https://sparks-effect.app', read)
    expect(reads.filter((path) => path.startsWith('/api/published-services'))).toHaveLength(2)
    expect(entries(xml)).toHaveLength(3)
  })

  it('reads the bare array an API older than SPA-434 answers as the whole list', async () => {
    const { read } = api({ '/api/scenarios': [], '/api/routes': [], [FIRST_SERVICES_PAGE]: SERVICES.items })
    const { xml, complete } = await renderSitemap('https://sparks-effect.app', read)
    expect(complete).toBe(true)
    expect(entries(xml).map(({ loc }) => loc)).toContain('https://sparks-effect.app/services/harbour-loop')
  })

  it('falls back to the cover page alone when the API cannot be read at all', async () => {
    const { read } = api({})
    const { xml, complete } = await renderSitemap('https://sparks-effect.app', read)
    expect(complete).toBe(false)
    expect(entries(xml)).toEqual([{ loc: 'https://sparks-effect.app/', lastmod: null }])
    expect(parse(xml).getElementsByTagName('parsererror')).toHaveLength(0)
  })

  it('keeps the lists that were read when one fails, and says it is incomplete', async () => {
    const timedOut = new DOMException('timed out', 'TimeoutError')
    const { read } = api({ '/api/scenarios': SCENARIOS, '/api/routes': ROUTES, [FIRST_SERVICES_PAGE]: timedOut })
    const { xml, complete } = await renderSitemap('https://sparks-effect.app', read)
    expect(complete).toBe(false)
    expect(entries(xml).map(({ loc }) => loc)).toEqual([
      'https://sparks-effect.app/',
      'https://sparks-effect.app/scenario/ca-hsr',
      'https://sparks-effect.app/routes/main-line',
    ])
  })

  it('treats an answer of the wrong shape as a failed read', async () => {
    const { read } = api({ '/api/scenarios': { error: 'nope' }, '/api/routes': ROUTES, [FIRST_SERVICES_PAGE]: { items: null } })
    const { xml, complete } = await renderSitemap('https://sparks-effect.app', read)
    expect(complete).toBe(false)
    expect(entries(xml).map(({ loc }) => loc)).toEqual(['https://sparks-effect.app/', 'https://sparks-effect.app/routes/main-line'])
  })

  it('skips an entry with no slug, and leaves out a lastmod it cannot read', async () => {
    const { read } = api({
      '/api/scenarios': [{ name: 'No slug' }, null, { slug: '' }],
      '/api/routes': [],
      [FIRST_SERVICES_PAGE]: { items: [{ slug: 'undated', published_at: 'yesterday' }, { slug: 'bare' }], next_cursor: null },
    })
    const { xml } = await renderSitemap('https://sparks-effect.app', read)
    expect(entries(xml)).toEqual([
      { loc: 'https://sparks-effect.app/', lastmod: null },
      { loc: 'https://sparks-effect.app/services/undated', lastmod: null },
      { loc: 'https://sparks-effect.app/services/bare', lastmod: null },
    ])
  })

  it('percent-encodes a slug and escapes everything it writes into the XML', async () => {
    const { read } = api({
      '/api/scenarios': [{ slug: `a&b<c>"d'/e` }],
      '/api/routes': [],
      [FIRST_SERVICES_PAGE]: { items: [], next_cursor: null },
    })
    const { xml } = await renderSitemap(`https://x.example.app`, read)

    expect(parse(xml).getElementsByTagName('parsererror')).toHaveLength(0)
    expect(entries(xml)[1].loc).toBe(`https://x.example.app/scenario/${encodeURIComponent(`a&b<c>"d'/e`)}`)
    expect(xml).toContain('<loc>https://x.example.app/scenario/a%26b%3Cc%3E%22d&#39;%2Fe</loc>')
    expect(xml).not.toMatch(/<loc>[^<]*[<>"][^<]*<\/loc>/)
  })

})
