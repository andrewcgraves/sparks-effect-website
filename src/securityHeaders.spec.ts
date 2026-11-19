// @vitest-environment node
/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveTilePreconnectOrigin } from './tileHost'
import { fetchSuggestions, lookupPlace, reverseGeocode } from './api/geocoding'
import {
  CATCH_ALL_SOURCE,
  EMBED_SOURCE,
  SECURITY_HEADER_KEYS,
  apiOriginMissingFromCsp,
  cspDirectives as parseCsp,
  type VercelHeaderRule,
} from './securityHeaders'

const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
  headers: VercelHeaderRule[]
}

const catchAll = vercelConfig.headers.find((rule) => rule.source === CATCH_ALL_SOURCE)
const embed = vercelConfig.headers.find((rule) => rule.source === EMBED_SOURCE)

function ruleHeader(rule: VercelHeaderRule | undefined, key: string): string | undefined {
  return rule?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value
}

function header(key: string): string | undefined {
  return ruleHeader(catchAll, key)
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
  const place = { type: 'Feature', geometry: { type: 'Point', coordinates: [-119.75, 39.53] }, properties: { gid: 'g' } }
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [place] })))
  vi.stubGlobal('fetch', fetchMock)
  await fetchSuggestions('Sparks')
  await lookupPlace({ label: 'Sparks', gid: 'g' })
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
    expect(origins).toHaveLength(3)
    for (const origin of origins) {
      expect(cspDirectives().get('connect-src'), origin).toContain(origin)
    }
  })
})

// The embed routes are the one place a foreign page may frame the site, and
// Vercel cannot unset a header another matching rule set — so the catch-all
// stops matching them and this rule repeats its headers. These keep the copy
// from drifting.
describe('vercel.json embed headers', () => {
  const withoutFrameAncestors = (policy: string | undefined) =>
    [...parseCsp(policy ?? '')].filter(([name]) => name !== 'frame-ancestors')

  it('keeps the catch-all off the embed routes and the embed rule on nothing else', () => {
    expect(embed).toBeDefined()
    expect(CATCH_ALL_SOURCE).toBe('/((?!embed/).*)')
    expect(EMBED_SOURCE).toBe('/embed/(.*)')
  })

  it('lets any page frame an embed, and only an embed', () => {
    expect(parseCsp(ruleHeader(embed, CSP_KEY) ?? '').get('frame-ancestors')).toEqual(['*'])
    expect(ruleHeader(embed, 'X-Frame-Options')).toBeUndefined()
    expect(cspDirectives().get('frame-ancestors')).toEqual(["'none'"])
    expect(header('X-Frame-Options')).toBe('DENY')
  })

  it('sends the same CSP as everywhere else but for frame-ancestors, under the same key', () => {
    expect(ruleHeader(embed, OTHER_CSP_KEY)).toBeUndefined()
    expect(withoutFrameAncestors(ruleHeader(embed, CSP_KEY))).toEqual(withoutFrameAncestors(header(CSP_KEY)))
  })

  it('sends every other catch-all header unchanged, and asks not to be indexed', () => {
    const others = (rule: VercelHeaderRule | undefined) =>
      (rule?.headers ?? []).filter(({ key }) => !/^(content-security-policy(-report-only)?|x-frame-options|x-robots-tag)$/i.test(key))
    expect(others(embed)).toEqual(others(catchAll))
    expect(ruleHeader(embed, 'X-Robots-Tag')).toBe('noindex')
  })
})

describe('apiOriginMissingFromCsp', () => {
  const rules = (key: string, policy: string): VercelHeaderRule[] => [
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: CATCH_ALL_SOURCE, headers: [{ key, value: policy }] },
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
