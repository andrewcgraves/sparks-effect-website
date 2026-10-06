/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
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

// Vercel compiles a source with path-to-regexp (strict, case-sensitive,
// anchored): a parenthesised group is a regex as written and every other
// character is literal, so the `.` in /robots.txt matches only a dot. Named
// parameters and modifiers outside a group are not modelled; a source that
// uses one fails here rather than being tried wrongly.
function sourceRegex(source: string): RegExp {
  const literal = (char: string) => char.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  let pattern = ''
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '(') {
      let depth = 0
      let end = i
      for (; end < source.length; end++) {
        if (source[end] === '\\') end++
        else if (source[end] === '(') depth++
        else if (source[end] === ')' && --depth === 0) break
      }
      pattern += source.slice(i, end + 1)
      i = end
    } else if (char === '\\') {
      pattern += literal(source[++i])
    } else if (':*+?{}'.includes(char)) {
      throw new Error(`no test support for ${char} in ${source}`)
    } else {
      pattern += literal(char)
    }
  }
  return new RegExp(`^${pattern}$`)
}

function matches(source: string, path: string): boolean {
  return sourceRegex(source).test(path)
}

// Vercel serves a file that exists before it tries a rewrite: a function in
// api/, or what the build emits (index.html, assets/, and whatever public/
// holds). Redirects, cleanUrls and trailing-slash handling are not modelled.
function onFilesystem(path: string): boolean {
  if (path === '/index.html' || path.startsWith('/assets/')) return true
  const fn = /^\/api\/([\w-]+)$/.exec(path)
  if (fn) return existsSync(resolve(process.cwd(), `api/${fn[1]}.ts`))
  return statSync(resolve(process.cwd(), `public${path}`), { throwIfNoEntry: false })?.isFile() ?? false
}

// Rewrites take the first match, as Vercel does.
function rewrite(path: string): string {
  if (onFilesystem(path)) return path
  return config.rewrites.find(({ source }) => matches(source, path))?.destination ?? path
}

// A has/missing value is a regex Vercel anchors at both ends.
function holds(condition: Condition, host: string): boolean {
  if (condition.type !== 'host') throw new Error(`no test support for a ${condition.type} condition`)
  return condition.value === undefined || new RegExp(`^(?:${condition.value})$`).test(host)
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
  'xsparks-effect.app',
  'sparks-effectXapp',
  'sparks-effect.app.example.com',
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

  it('matches a dot in a source as a dot, not as any character', () => {
    expect(matches('/robots.txt', '/robots.txt')).toBe(true)
    expect(matches('/robots.txt', '/robotsXtxt')).toBe(false)
    expect(rewrite('/robotsXtxt')).toBe('/index.html')
    expect(rewrite('/sitemapXxml')).toBe('/index.html')
  })

  it('leaves the functions themselves to the filesystem, ahead of every rewrite', () => {
    expect(rewrite('/api/robots')).toBe('/api/robots')
    expect(rewrite('/api/sitemap')).toBe('/api/sitemap')
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

  it('never tells them that on production, at the apex or on www', () => {
    for (const host of [PRODUCTION, `www.${PRODUCTION}`]) {
      for (const path of PATHS) expect(headersFor(path, host)['x-robots-tag'], `${host}${path}`).toBeUndefined()
    }
  })
})
