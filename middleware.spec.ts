// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import middleware from './middleware.js'

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Sparks Effect</title>
  </head>
  <body><div id="app"></div></body>
</html>`

const SHELL_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy-Report-Only': "default-src 'self'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'X-Frame-Options': 'DENY',
}

function stubFetch(shellHeaders: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = new URL(String(input))
    if (url.pathname === '/index.html') {
      return new Response(SHELL, {
        headers: {
          ...shellHeaders,
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=0, must-revalidate',
          etag: '"shell"',
        },
      })
    }
    return new Response('{}', { status: 404 })
  }))
}

describe('middleware', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('carries the shell response security headers onto the page it builds', async () => {
    stubFetch(SHELL_SECURITY_HEADERS)
    const res = await middleware(new Request('https://www.example.app/scenario/ca-hsr'))

    expect(res).toBeInstanceOf(Response)
    for (const [key, value] of Object.entries(SHELL_SECURITY_HEADERS)) {
      expect(res!.headers.get(key), key).toBe(value)
    }
    expect(res!.headers.get('Content-Security-Policy')).toBeNull()
  })

  it('carries an enforcing CSP the same way', async () => {
    stubFetch({ 'Content-Security-Policy': "default-src 'self'" })
    const res = await middleware(new Request('https://www.example.app/'))

    expect(res!.headers.get('Content-Security-Policy')).toBe("default-src 'self'")
    expect(res!.headers.get('Content-Security-Policy-Report-Only')).toBeNull()
  })

  it('keeps its own caching and content type, and nothing else of the shell', async () => {
    stubFetch(SHELL_SECURITY_HEADERS)
    const res = await middleware(new Request('https://www.example.app/services/northbound-express'))

    expect(res!.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=86400')
    expect(res!.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res!.headers.get('etag')).toBeNull()
  })

  it('carries the headers on a HEAD as well', async () => {
    stubFetch(SHELL_SECURITY_HEADERS)
    const res = await middleware(new Request('https://www.example.app/routes/main-line', { method: 'HEAD' }))

    expect(res!.body).toBeNull()
    expect(res!.headers.get('X-Frame-Options')).toBe('DENY')
  })

  // A protected preview answers the shell fetch with a 302 to Vercel's sign-in,
  // whose login page is a 200. Following it would serve that page as ours.
  it('falls through when the shell fetch is redirected to a sign-in page', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (new URL(String(input)).pathname !== '/index.html') return new Response('{}', { status: 404 })
      if (init?.redirect === 'manual') {
        return new Response(null, { status: 302, headers: { location: 'https://vercel.com/sso-api' } })
      }
      return new Response('<title>Login – Vercel</title>', { headers: { 'content-type': 'text/html' } })
    }))
    const res = await middleware(new Request('https://preview.example.app/'))

    expect(res).toBeUndefined()
  })
})
