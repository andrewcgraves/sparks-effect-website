// @vitest-environment node
/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveTilePreconnectOrigin } from './tileHost'
import { fetchSuggestions, reverseGeocode } from './api/geocoding'
import {
  SECURITY_HEADER_KEYS,
  apiOriginMissingFromCsp,
  cspDirectives as parseCsp,
  type VercelHeaderRule,
} from './securityHeaders'

const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
  headers: VercelHeaderRule[]
}

const catchAll = vercelConfig.headers.find((rule) => rule.source === '/(.*)')

function header(key: string): string | undefined {
  return catchAll?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value
}

// Report-Only until a clean week on staging; then this flips to true and
// vercel.json's key loses its suffix.
const ENFORCING = false
const CSP_KEY = ENFORCING ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'
const OTHER_CSP_KEY = ENFORCING ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'

function cspDirectives(): Map<string, string[]> {
  return parseCsp(header(CSP_KEY) ?? '')
}

async function geocoderOrigins(): Promise<string[]> {
  const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await fetchSuggestions('Sparks')
  await reverseGeocode(39.53, -119.75)
  return fetchMock.mock.calls.map((call: unknown[]) => new URL(String(call[0])).origin)
}

describe('vercel.json security headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends every security header on every path', () => {
    expect(catchAll).toBeDefined()
    for (const key of [
      CSP_KEY,
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'X-Frame-Options',
    ]) {
      expect(header(key), key).toBeTruthy()
    }
    expect(header(OTHER_CSP_KEY)).toBeUndefined()
  })

  it('names every catch-all header in the list the middleware copies onto its pages', () => {
    const copied = SECURITY_HEADER_KEYS.map((key) => key.toLowerCase())
    for (const { key } of catchAll?.headers ?? []) {
      expect(copied, key).toContain(key.toLowerCase())
    }
  })

  it('denies framing in both the CSP and X-Frame-Options', () => {
    expect(cspDirectives().get('frame-ancestors')).toEqual(["'none'"])
    expect(header('X-Frame-Options')).toBe('DENY')
  })

  it('keeps geolocation for "use my location"', () => {
    expect(header('Permissions-Policy')).toContain('geolocation=(self)')
  })

  it('runs no inline or eval-ed script', () => {
    const scriptSrc = cspDirectives().get('script-src')
    expect(scriptSrc).toBeDefined()
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
  })

  it('lets MapLibre start its same-origin worker', () => {
    expect(cspDirectives().get('worker-src')).toContain("'self'")
  })

  it('allows the origin of every map style URL the map can load', () => {
    const directives = cspDirectives()
    for (const origin of [resolveTilePreconnectOrigin(undefined), resolveTilePreconnectOrigin('a-stadia-key')]) {
      expect(directives.get('connect-src'), origin).toContain(origin)
      expect(directives.get('img-src'), origin).toContain(origin)
    }
  })

  it('allows the geocoder the search box calls', async () => {
    const origins = await geocoderOrigins()
    expect(origins).toHaveLength(2)
    for (const origin of origins) {
      expect(cspDirectives().get('connect-src'), origin).toContain(origin)
    }
  })
})

describe('apiOriginMissingFromCsp', () => {
  const rules = (key: string, policy: string): VercelHeaderRule[] => [
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/(.*)', headers: [{ key, value: policy }] },
  ]

  it('passes both API hosts vercel.json names', () => {
    for (const base of [
      'https://sparks-effect-api-production.up.railway.app',
      'https://sparks-effect-api-staging.up.railway.app/',
    ]) {
      expect(apiOriginMissingFromCsp(vercelConfig.headers, base), base).toBeNull()
    }
  })

  it('names a host connect-src does not list, path and all ignored', () => {
    const problem = apiOriginMissingFromCsp(vercelConfig.headers, 'https://api.elsewhere.example/v1')
    expect(problem).toContain('https://api.elsewhere.example ')
    expect(problem).toContain('connect-src')
  })

  it('reads either CSP key, and default-src when there is no connect-src', () => {
    const base = 'https://api.example.com'
    expect(apiOriginMissingFromCsp(rules('Content-Security-Policy', `connect-src 'self' ${base}`), base)).toBeNull()
    expect(apiOriginMissingFromCsp(rules('Content-Security-Policy', `default-src 'self' ${base}`), base)).toBeNull()
    expect(apiOriginMissingFromCsp(rules('Content-Security-Policy-Report-Only', "connect-src 'self'"), base)).not.toBeNull()
  })

  it('has nothing to check without a configured absolute API base or a CSP', () => {
    expect(apiOriginMissingFromCsp(vercelConfig.headers, undefined)).toBeNull()
    expect(apiOriginMissingFromCsp(vercelConfig.headers, '  ')).toBeNull()
    expect(apiOriginMissingFromCsp(vercelConfig.headers, '/api')).toBeNull()
    expect(apiOriginMissingFromCsp(rules('X-Frame-Options', 'DENY'), 'https://api.example.com')).toBeNull()
  })
})
