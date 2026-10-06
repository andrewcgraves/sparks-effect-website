// @vitest-environment node
/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveTilePreconnectOrigin } from './tileHost'
import { fetchSuggestions, reverseGeocode } from './api/geocoding'

interface HeaderRule {
  source: string
  headers: { key: string; value: string }[]
}

const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
  headers: HeaderRule[]
}

const catchAll = vercelConfig.headers.find((rule) => rule.source === '/(.*)')

function header(key: string): string | undefined {
  return catchAll?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value
}

// Report-Only until a clean week on staging; then the key loses its suffix.
const CSP_KEY = 'Content-Security-Policy-Report-Only'

function cspDirectives(): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of (header(CSP_KEY) ?? '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) directives.set(name, sources)
  }
  return directives
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
    expect(header('Content-Security-Policy')).toBeUndefined()
  })

  it('denies framing now, since frame-ancestors is ignored while the CSP only reports', () => {
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

  it('allows every tile host the map style can come from', () => {
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
