// `.js`, not `.ts`: Vercel compiles this file by file without rewriting
// specifiers, so a `.ts` import is missing at runtime.
import { renderPreview } from './src/share/linkPreview.js'

// Vercel Routing Middleware. Link-unfurl crawlers run no JavaScript, so a
// public page's preview has to be in the HTML itself. Only the public pages
// match; /index.html must not, or the shell fetch below would recurse.
export const config = {
  matcher: ['/', '/scenario/:slug', '/services/:slug', '/routes/:slug'],
  runtime: 'nodejs',
}

const TIMEOUT_MS = 1500

async function readApi(path: string): Promise<unknown> {
  const base = process.env.VITE_API_BASE_URL
  if (!base) throw new Error('VITE_API_BASE_URL is not set')
  const res = await fetch(`${base}${path}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${path} answered ${res.status}`)
  return res.json()
}

async function fetchShell(request: Request): Promise<string | null> {
  try {
    const res = await fetch(new URL('/index.html', request.url), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined
  // No shell to splice into — a protected preview deployment answers this
  // fetch 401 — so fall through to the plain rewrite: the page still loads,
  // with the build's default card.
  const shell = await fetchShell(request)
  if (shell === null) return undefined
  const html = await renderPreview(new URL(request.url), shell, readApi)
  return new Response(request.method === 'HEAD' ? null : html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400',
    },
  })
}
