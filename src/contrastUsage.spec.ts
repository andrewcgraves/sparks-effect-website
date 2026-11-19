/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

const sourceFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(vue|ts)$/.test(path) && !path.endsWith('.spec.ts'))
  .map((path) => ({ path: `src/${path.split(sep).join('/')}`, text: readFileSync(join(SRC, path), 'utf8') }))

// White on coral is 3.36:1 and coral on white the same, short of the 4.5:1 AA
// asks of body-size text (SPA-510). A string literal or attribute value is the
// unit: a ternary's two branches count as one string, which errs towards a
// false alarm rather than a miss. Utilities are matched whole, so a coral tint
// such as `bg-coral/10` under ink text passes.
const QUOTED = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g

// An icon component draws a graphic, not text, and WCAG 1.4.11 asks 3:1 of a
// graphic, which coral on white meets (SPA-518), so its tag is not scanned.
const ICON_TAG = /<[A-Z]\w*Icon\b[^>]*>/g

function utilities(classString: string): { variants: string, utility: string }[] {
  return classString.split(/[\s'"`]+/).filter(Boolean).map((token) => {
    const split = token.lastIndexOf(':')
    return { variants: token.slice(0, Math.max(split, 0)), utility: token.slice(split + 1) }
  })
}

function contrastFailures(source: string): string[] {
  const failures: string[] = []
  for (const [quoted] of source.replace(ICON_TAG, '').matchAll(QUOTED)) {
    const found = utilities(quoted.slice(1, -1))
    if (found.some(({ utility }) => utility === 'bg-coral') && found.some(({ utility }) => utility === 'text-white')) {
      failures.push(`bg-coral with text-white in ${quoted}`)
    }
    for (const { variants, utility } of found) {
      if (/^text-coral(?:\/\d+)?$/.test(utility) && !/hover|focus/.test(variants)) {
        failures.push(`${variants ? `${variants}:` : ''}${utility} in ${quoted}`)
      }
    }
  }
  return failures
}

describe('text contrast in class strings', () => {
  it('scans the real source rather than silently matching nothing', () => {
    expect(sourceFiles.map(({ path }) => path)).toContain('src/components/buttonStyles.ts')
  })

  it.each([
    "'bg-coral text-white'",
    '"aria-pressed:bg-coral aria-pressed:text-white"',
    '`${BASE} hover:bg-coral hover:text-white`',
    "'text-coral'",
    '"aria-[current=page]:text-coral"',
  ])('flags %s', (sample) => {
    expect(contrastFailures(sample)).toHaveLength(1)
  })

  it.each([
    "'border-coral bg-coral/10 text-ink'",
    "'bg-coral text-ink'",
    "'bg-ink text-white hover:bg-ink-muted'",
    '"focus-visible:text-coral"',
    '"aria-[current=page]:decoration-coral"',
    '<PinIcon class="size-5 text-coral" />',
  ])('passes %s', (sample) => {
    expect(contrastFailures(sample)).toEqual([])
  })

  it('sets no text white on coral or coral on white anywhere in src', () => {
    const failing = Object.fromEntries(
      sourceFiles
        .map(({ path, text }) => [path, contrastFailures(text)] as const)
        .filter(([, failures]) => failures.length > 0),
    )
    expect(failing, 'use PRIMARY_BUTTON_CLASS or SELECTED_CHOICE_CLASS from buttonStyles.ts').toEqual({})
  })
})
