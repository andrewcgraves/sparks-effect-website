// @vitest-environment node
/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

// Another site may frame an embed (frame-ancestors *), so nothing it runs may
// act as the visitor. This walks every module an embed view loads, following
// value imports (a type import runs nothing), and lists what each takes from
// src/api/. Each module named here is the whole allowance for that module.
const PUBLIC_API: Record<string, string[] | '*'> = {
  'api/scenarios': ['fetchScenario'],
  'api/prerenderedIsochrones': ['listPrerenderedIsochrones', 'fetchPrerenderedIsochrone'],
  'api/publications': ['fetchServicePublication', 'fetchPublicationIsochrone'],
  'api/isochrone': ['fetchIsochrone'],
  'api/routingStatus': ['fetchRoutingStatus'],
  'api/geocoding': ['fetchSuggestions', 'lookupPlace', 'reverseGeocode'],
  'api/geolocation': '*',
  // Wording and plumbing: no requests of their own beyond what the public
  // reads above enqueue and poll.
  'api/isochroneFault': '*',
  'api/authoringFault': '*',
  'api/routingJobs': '*',
  'api/polling': '*',
  'api/traceId': '*',
  'api/authoring/types': '*',
  'api/authoring/client': ['ApiError', 'apiRequest', 'apiBase', 'isSessionExpiry'],
  // Loaded through useAuthoredGraph's compile path (useCompileJob, the jobs
  // store), which only a target with a `compile` can take; the service embed
  // pins a publication, which has none — checked below.
  'api/authoring': ['pollJobToResult'],
}

const ENTRIES = ['src/views/EmbedScenarioView.vue', 'src/views/EmbedServiceView.vue']

const SRC = resolve(process.cwd(), 'src')

interface ValueImport {
  from: string
  names: string[]
}

function script(file: string): string {
  const text = readFileSync(file, 'utf8')
  if (!file.endsWith('.vue')) return text
  return [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
}

function valueImports(source: string): ValueImport[] {
  const found: ValueImport[] = []
  const statement = /(?:import|export)\s+(type\s+)?([\w$*\s{},]*?)\s*from\s+'([^']+)'/g
  for (const [, wholeType, clause, from] of source.matchAll(statement)) {
    if (wholeType) continue
    const names: string[] = []
    const braced = /\{([^}]*)\}/.exec(clause)?.[1] ?? ''
    for (const part of braced.split(',')) {
      const name = part.trim()
      if (name && !name.startsWith('type ')) names.push(name.split(/\s+as\s+/)[0])
    }
    const bare = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim()
    if (bare) names.push(bare.startsWith('*') ? '*' : 'default')
    if (names.length) found.push({ from, names })
  }
  for (const [, from] of source.matchAll(/import\(\s*'([^']+)'\s*\)/g)) found.push({ from, names: ['*'] })
  return found
}

function resolveModule(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(candidate) && /\.(ts|vue)$/.test(candidate)) return candidate
  }
  return null
}

function moduleName(file: string): string {
  return relative(SRC, file).replace(/\.(ts|vue)$/, '').replace(/\/index$/, '')
}

function walk(): { reached: Set<string>; apiUses: Map<string, Set<string>> } {
  const reached = new Set<string>()
  const apiUses = new Map<string, Set<string>>()
  const queue = ENTRIES.map((entry) => resolve(process.cwd(), entry))
  while (queue.length) {
    const file = queue.pop()!
    if (reached.has(file)) continue
    reached.add(file)
    for (const { from, names } of valueImports(script(file))) {
      const target = resolveModule(file, from)
      if (!target) continue
      const name = moduleName(target)
      // src/api/ is the edge: what the embed's own code takes from it is the
      // question, not how the API modules share plumbing among themselves.
      if (name.startsWith('api/')) {
        const uses = apiUses.get(name) ?? new Set<string>()
        names.forEach((n) => uses.add(n))
        apiUses.set(name, uses)
        reached.add(target)
        continue
      }
      queue.push(target)
    }
  }
  return { reached: new Set([...reached].map(moduleName)), apiUses }
}

describe('what an embed can call', () => {
  const { reached, apiUses } = walk()

  it('reaches the views it starts from', () => {
    expect(reached).toContain('views/EmbedScenarioView')
    expect(reached).toContain('views/EmbedServiceView')
    expect(reached).toContain('composables/useAuthoredGraph')
  })

  it('never loads the session', () => {
    expect([...reached].filter((name) => name === 'stores/auth' || name === 'stores/install')).toEqual([])
  })

  it('pins the service embed to its publication, which nothing can compile', () => {
    const view = script(resolve(process.cwd(), 'src/views/EmbedServiceView.vue'))
    const target = /useAuthoredGraph\([^{]*\{([^}]*)\}/.exec(view)?.[1] ?? ''
    expect(target).toContain('fetchGraph: fetchServicePublication')
    expect(target).not.toContain('compile')
  })

  it('uses only the public reads from src/api/', () => {
    const outside: string[] = []
    for (const [module, names] of apiUses) {
      const allowed = PUBLIC_API[module]
      for (const name of names) {
        if (allowed === '*') continue
        if (!allowed?.includes(name)) outside.push(`${module}: ${name}`)
      }
    }
    expect(outside).toEqual([])
  })
})
