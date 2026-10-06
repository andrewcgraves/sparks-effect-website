/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface Condition {
  type: string
  value?: string
}

interface HeaderRule {
  source: string
  has?: Condition[]
  missing?: Condition[]
  headers: { key: string; value: string }[]
}

interface VercelConfig {
  rewrites: { source: string; destination: string }[]
  headers: HeaderRule[]
}

const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as VercelConfig

// Every source in vercel.json is a bare regex over the path, so it can be
// tried as one. Rewrites take the first match, as Vercel does.
function matches(source: string, path: string): boolean {
  return new RegExp(`^${source}$`).test(path)
}

function rewrite(path: string): string {
  return config.rewrites.find(({ source }) => matches(source, path))?.destination ?? path
}

function holds(condition: Condition, host: string): boolean {
  if (condition.type !== 'host') throw new Error(`no test support for a ${condition.type} condition`)
  return condition.value === undefined || condition.value === host
}

function headersFor(path: string, host: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rule of config.headers) {
    if (!matches(rule.source, path)) continue
    if (rule.has && !rule.has.every((condition) => holds(condition, host))) continue
    if (rule.missing && rule.missing.some((condition) => holds(condition, host))) continue
    for (const { key, value } of rule.headers) out[key.toLowerCase()] = value
  }
  return out
}

const PRODUCTION = 'sparks-effect.app'
const NOT_PRODUCTION = [
  'dev.sparks-effect.app',
  'sparks-effect-website.vercel.app',
  'sparks-effect-website-git-claude-2643c5-andrewcgraves-projects.vercel.app',
  'sparks-effect-website-7geea1s8q-andrewcgraves-projects.vercel.app',
]
const PATHS = [
  '/',
  '/scenario/ca-hsr',
  '/services/northbound-express',
  '/routes/main-line',
  '/login',
  '/authoring/services/x/edit',
  '/index.html',
  '/assets/index-abc123.js',
  '/robots.txt',
  '/sitemap.xml',
  '/api/sitemap',
]

describe('vercel.json rewrites', () => {
  it('serves /robots.txt and /sitemap.xml from their functions, not the SPA shell', () => {
    expect(rewrite('/robots.txt')).toBe('/api/robots')
    expect(rewrite('/sitemap.xml')).toBe('/api/sitemap')
    expect(existsSync(resolve(process.cwd(), 'api/robots.ts'))).toBe(true)
    expect(existsSync(resolve(process.cwd(), 'api/sitemap.ts'))).toBe(true)
  })

  it('keeps the catch-all itself off /robots.txt and /sitemap.xml', () => {
    const catchAll = config.rewrites.find(({ destination }) => destination === '/index.html')!
    expect(matches(catchAll.source, '/robots.txt')).toBe(false)
    expect(matches(catchAll.source, '/sitemap.xml')).toBe(false)
    expect(matches(catchAll.source, '/robots.txt/x')).toBe(true)
  })

  it('still serves the shell for every page and leaves assets alone', () => {
    for (const path of ['/', '/scenario/ca-hsr', '/login', '/authoring', '/nope']) expect(rewrite(path), path).toBe('/index.html')
    expect(rewrite('/assets/index-abc123.js')).toBe('/assets/index-abc123.js')
  })
})

describe('vercel.json headers', () => {
  it('lets the CDN keep robots.txt and the sitemap rather than forcing no-cache over them', () => {
    expect(headersFor('/robots.txt', PRODUCTION)['cache-control']).toBeUndefined()
    expect(headersFor('/sitemap.xml', PRODUCTION)['cache-control']).toBeUndefined()
    expect(headersFor('/login', PRODUCTION)['cache-control']).toBe('no-cache')
  })

  it('tells crawlers not to index anything served on staging, a preview or a vercel.app alias', () => {
    for (const host of NOT_PRODUCTION) {
      for (const path of PATHS) expect(headersFor(path, host)['x-robots-tag'], `${host}${path}`).toBe('noindex')
    }
  })

  it('never tells them that on production', () => {
    for (const path of PATHS) expect(headersFor(path, PRODUCTION)['x-robots-tag'], path).toBeUndefined()
  })
})
