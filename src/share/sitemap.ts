import type { ApiRead } from './apiRead.js'
import { escapeHtml } from './linkPreview.js'

interface SitemapUrl {
  path: string
  lastmod?: string
}

export interface Sitemap {
  xml: string
  complete: boolean
}

const SERVICES_PER_PAGE = 100
const SERVICES_MAX_PAGES = 100

function slugOf(item: unknown): string | null {
  const slug = (item as { slug?: unknown } | null)?.slug
  return typeof slug === 'string' && slug ? slug : null
}

function pagePath(page: string, slug: string): string {
  return `/${page}/${encodeURIComponent(slug)}`
}

function lastmodOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString()
}

// GET /api/scenarios and GET /api/routes list curated rows only, so nothing an
// owner keeps private can be named here.
async function curatedUrls(read: ApiRead, endpoint: string, page: string): Promise<SitemapUrl[]> {
  const body = await read(endpoint)
  if (!Array.isArray(body)) throw new Error(`${endpoint} did not answer a list`)
  return body.flatMap((item) => {
    const slug = slugOf(item)
    return slug ? [{ path: pagePath(page, slug) }] : []
  })
}

async function publishedServiceUrls(read: ApiRead): Promise<SitemapUrl[]> {
  const urls: SitemapUrl[] = []
  let cursor = ''
  for (let page = 0; page < SERVICES_MAX_PAGES; page++) {
    const params = new URLSearchParams({ cursor, limit: String(SERVICES_PER_PAGE) })
    const body = (await read(`/api/published-services?${params}`)) as
      | { items?: unknown; next_cursor?: unknown }
      | unknown[]
    // An API older than SPA-434 ignores the cursor and answers everything as
    // a bare array, which is a last page (src/api/publishedIndex.ts).
    const items = Array.isArray(body) ? body : body?.items
    if (!Array.isArray(items)) throw new Error('/api/published-services did not answer a page')
    for (const item of items as ({ published_at?: unknown } | null)[]) {
      const slug = slugOf(item)
      if (slug) urls.push({ path: pagePath('services', slug), lastmod: lastmodOf(item?.published_at) })
    }
    const next = Array.isArray(body) ? null : body.next_cursor
    if (typeof next !== 'string' || !next || next === cursor) break
    cursor = next
  }
  return urls
}

function urlEntry(origin: string, { path, lastmod }: SitemapUrl): string {
  const loc = `<loc>${escapeHtml(`${origin}${path}`)}</loc>`
  return `  <url>${loc}${lastmod ? `<lastmod>${escapeHtml(lastmod)}</lastmod>` : ''}</url>`
}

// Only pages src/router/index.ts serves to anyone. A list that cannot be read
// is left out rather than failing the whole sitemap, and `complete` says so,
// so the caller can cache the short answer for less time. With nothing read,
// the sitemap is the cover page alone.
export async function renderSitemap(origin: string, read: ApiRead): Promise<Sitemap> {
  const lists = await Promise.allSettled([
    curatedUrls(read, '/api/scenarios', 'scenario'),
    curatedUrls(read, '/api/routes', 'routes'),
    publishedServiceUrls(read),
  ])
  const urls: SitemapUrl[] = [{ path: '/' }]
  for (const list of lists) {
    if (list.status === 'fulfilled') urls.push(...list.value)
  }
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => urlEntry(origin, url)),
    '</urlset>',
    '',
  ].join('\n')
  return { xml, complete: lists.every((list) => list.status === 'fulfilled') }
}
