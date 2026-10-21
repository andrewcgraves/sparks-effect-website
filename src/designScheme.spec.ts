/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

const sourceFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(vue|ts|css)$/.test(path) && !path.endsWith('.spec.ts'))
  .map((path) => ({ path, text: readFileSync(join(SRC, path), 'utf8') }))

function filesUsing(className: string): string[] {
  return sourceFiles.filter(({ text }) => text.includes(className)).map(({ path }) => path)
}

describe('design scheme', () => {
  it('scans the real source rather than silently matching nothing', () => {
    expect(sourceFiles.map(({ path }) => path)).toContain(join('components', 'linkStyles.ts'))
  })

  // Coral means selected, focus and primary; hover is ink (SPA-519). Joined
  // so `grep -rn` for the class finds no hit in this file.
  it('never turns text coral on hover', () => {
    expect(filesUsing(['hover', 'text-coral'].join(':'))).toEqual([])
  })
})

// Every type and surface style comes from theme.css: a raw size, radius,
// shadow, weight, tint or colour anywhere in src fails, with no baseline to
// absorb it. Changing the scheme means changing theme.css.
const PATTERNS = {
  arbitraryText: /\btext-\[[^\]\s]*\]/g,
  arbitraryRadius: /\brounded(?:-[a-z]+)?-\[[^\]\s]*\]/g,
  arbitraryShadow: /\bshadow-\[[^\]\s]*\]/g,
  scaleShadow: /(?<![-\w])shadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)\b/g,
  offScaleWeight: /\bfont-(?:medium|semibold)\b/g,
  overlayTint: /\bbg-white\/(?!92\b)\d+/g,
  hexColour: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  rawSmallText: /(?<![-\w])text-(?:micro|caption)\b/g,
  rawParagraphText: /(?<![-\w])(?:font-body|text-body|text-lead)\b/g,
  rawItalic: /(?<![-\w])italic\b/g,
} as const

type PatternName = keyof typeof PATTERNS

const HEX_ALLOWED: Record<string, string> = {
  'src/theme.css': 'where the palette is defined',
  'src/themeTokens.ts': 'fallbacks that mirror theme.css for code that reads tokens at runtime',
  'src/composables/useRouteLayer.ts': 'MapLibre paint takes literal colour strings, not CSS variables',
  'src/composables/useStopPreviewLayer.ts': 'MapLibre paint takes literal colour strings, not CSS variables',
  'src/composables/useRouteEditor.ts': 'terra-draw styles take literal hex colours, and the theme has no white token',
  'src/components/KeySwatch.vue': 'an SVG pattern fill, which needs a literal colour',
}

function matchesIn(source: string, name: PatternName): string[] {
  return source.match(PATTERNS[name]) ?? []
}

const scannedFiles = sourceFiles.map(({ path, text }) => ({ path: `src/${path.split(sep).join('/')}`, text }))

describe('design scheme rule', () => {
  it.each(Object.keys(HEX_ALLOWED))('%s still needs its hex exemption', (path) => {
    const file = scannedFiles.find((f) => f.path === path)
    expect(file, `${path} is gone; drop it from HEX_ALLOWED`).toBeDefined()
    expect(matchesIn(file!.text, 'hexColour'), `${path} has no hex left; drop it from HEX_ALLOWED`).not.toEqual([])
  })

  it.each(Object.keys(PATTERNS) as PatternName[])('%s matches what it should and nothing else', (name) => {
    const samples: Record<PatternName, [string, string]> = {
      arbitraryText: ['class="text-[13px]"', 'class="t-meta text-ink"'],
      arbitraryRadius: ['class="rounded-t-[2px]"', 'class="rounded-(--radius-field)"'],
      arbitraryShadow: ['class="shadow-[0_1px_2px_black]"', 'class="shadow-(--shadow-panel)"'],
      scaleShadow: ['class="p-2 shadow-sm"', 'class="lg:shadow-(--shadow-panel) drop-shadow-sm" box-shadow: none'],
      offScaleWeight: ['class="font-semibold"', 'class="font-bold"'],
      overlayTint: ['class="bg-white/80"', 'class="bg-white/92 bg-white"'],
      hexColour: ["color: '#c2453b'", 'href="#main" &#8212;'],
      rawSmallText: ['class="text-micro uppercase"', 'class="t-meta" var(--text-caption)'],
      rawParagraphText: ['class="font-body mt-3"', 'class="t-body" var(--font-body) var(--text-lead)'],
      rawItalic: ['class="text-ink-muted italic"', 'class="t-note not-italic"'],
    }
    const [hit, miss] = samples[name]
    expect(matchesIn(hit, name)).toHaveLength(1)
    expect(matchesIn(miss, name)).toEqual([])
  })

  it.each(Object.keys(PATTERNS) as PatternName[])('no source file uses %s', (name) => {
    const offenders = scannedFiles
      .filter(({ path }) => !(name === 'hexColour' && path in HEX_ALLOWED))
      // CSS sets font-style itself; the italic utility only means something in markup.
      .filter(({ path }) => !(name === 'rawItalic' && path.endsWith('.css')))
      .flatMap(({ path, text }) => matchesIn(text, name).map((match) => `${path}: ${match}`))
    expect(offenders, 'use a theme.css token or t-* role instead').toEqual([])
  })
})
