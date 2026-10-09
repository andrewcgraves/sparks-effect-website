// `.js`, not `.ts`: Vercel compiles this file by file without rewriting
// specifiers, so a `.ts` import is missing at runtime.
import { anonymousApiRead } from './src/share/apiRead.js'
import { renderPreview } from './src/share/linkPreview.js'
import { copySecurityHeaders } from './src/securityHeaders.js'

// Vercel Routing Middleware. Link-unfurl crawlers run no JavaScript, so a
// public page's preview has to be in the HTML itself. Only the public pages
// match; /index.html must not, or the shell fetch below would recurse.
export const config = {
  matcher: ['/', '/how-it-works', '/scenario/:slug', '/services/:slug', '/routes/:slug'],
  runtime: 'nodejs',
}

const TIMEOUT_MS = 1500

interface Shell {
  html: string
  headers: Headers
}

async function fetchShell(request: Request): Promise<Shell | null> {
  try {
    const res = await fetch(new URL('/index.html', request.url), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return res.ok ? { html: await res.text(), headers: res.headers } : null
  } catch {
    return null
  }
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined
  const read = anonymousApiRead(process.env.VITE_API_BASE_URL, TIMEOUT_MS)
  const shell = fetchShell(request)
  const html = await renderPreview(new URL(request.url), shell.then((s) => s?.html ?? null), read)
  // No shell to splice into — a protected preview deployment answers its
  // fetch 401 — so fall through to the plain rewrite: the page still loads,
  // with the build's default card.
  if (html === null) return undefined
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400',
  })
  // Vercel may not apply vercel.json's headers to a response the middleware
  // builds itself. The shell fetch is an ordinary static hit that does carry
  // them, so copy the security headers from it: vercel.json stays their one
  // source, and nothing else of the shell's (its caching above all) comes along.
  const shellHeaders = (await shell)?.headers
  if (shellHeaders) copySecurityHeaders(shellHeaders, headers)
  return new Response(request.method === 'HEAD' ? null : html, { headers })
}
