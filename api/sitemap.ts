// `.js`, not `.ts`, for the same reason as middleware.ts.
import { anonymousApiRead } from '../src/share/apiRead.js'
import { renderSitemap } from '../src/share/sitemap.js'

// Served at /sitemap.xml (vercel.json). A function rather than middleware so
// the CDN can keep the answer: middleware runs in front of the cache, and
// every crawl would read the API three times over.
const TIMEOUT_MS = 5000
// For every read together, paging included: well inside the function's
// maxDuration, so a slow API costs lists, never the response.
const DEADLINE_MS = 8000

export async function GET(request: Request): Promise<Response> {
  // The requesting host, never the build's: a build promoted from staging has
  // to name production (docs/releases.md).
  const { origin } = new URL(request.url)
  const read = anonymousApiRead(process.env.VITE_API_BASE_URL, TIMEOUT_MS)
  const { xml, complete } = await renderSitemap(origin, read, AbortSignal.timeout(DEADLINE_MS))
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // A sitemap missing a list is kept for minutes, not the hour, so a
      // recovered API is back in it soon.
      'cache-control': complete
        ? 'public, s-maxage=3600, stale-while-revalidate=86400'
        : 'public, s-maxage=300',
    },
  })
}

// Unexported methods answer 405, and crawlers and uptime checks send HEAD.
export const HEAD = GET
