/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { THEME_TOKEN_FALLBACKS, readThemeToken, type ThemeTokenName } from './themeTokens'

const themeCss = readFileSync(resolve(process.cwd(), 'src/theme.css'), 'utf8')

function tokenValueInThemeCss(name: string): string | undefined {
  return new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(themeCss)?.[1].trim()
}

function srgbChannel(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) throw new Error(`expected a 6-digit hex colour, got ${hex}`)
  const value = Number.parseInt(match[1], 16)
  const red = srgbChannel(((value >> 16) & 0xff) / 255)
  const green = srgbChannel(((value >> 8) & 0xff) / 255)
  const blue = srgbChannel((value & 0xff) / 255)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('theme token fallbacks', () => {
  it.each(Object.keys(THEME_TOKEN_FALLBACKS) as ThemeTokenName[])(
    '%s matches its value in theme.css',
    (name) => {
      expect(tokenValueInThemeCss(name)).toBe(THEME_TOKEN_FALLBACKS[name])
    },
  )

  it('finds real declarations in theme.css rather than silently matching nothing', () => {
    expect(tokenValueInThemeCss('--color-data-origin')).toBeDefined()
    expect(tokenValueInThemeCss('--not-a-real-token')).toBeUndefined()
  })

  it('falls back to the theme.css value when no stylesheet is loaded', () => {
    // The DOM environment loads no stylesheet, so getComputedStyle resolves the
    // custom property to '' and the fallback is what comes back.
    expect(readThemeToken('--color-data-origin')).toBe('#1034b1')
    expect(readThemeToken('--color-coral')).toBe('#e1665b')
  })
})

describe('error text colour', () => {
  it('is #c2453b and clears WCAG AA 4.5:1 on white and on the surface', () => {
    const error = tokenValueInThemeCss('--color-error')
    const surface = tokenValueInThemeCss('--color-surface')
    expect(error).toBe('#c2453b')
    expect(surface).toBeDefined()
    expect(contrastRatio(error!, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(error!, surface!)).toBeGreaterThanOrEqual(4.5)
  })
})

function hexChannels(hex: string): number[] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function tintOver(tint: string, alpha: number, base: string): string {
  const [tintChannels, baseChannels] = [hexChannels(tint), hexChannels(base)]
  return `#${tintChannels
    .map((channel, index) => Math.round(channel * alpha + baseChannels[index] * (1 - alpha)))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function token(name: string): string {
  const value = tokenValueInThemeCss(name)
  if (!value) throw new Error(`${name} is not declared in theme.css`)
  return value
}

describe('text on fill', () => {
  const WHITE = '#ffffff'

  // SPA-510: the primary button is ink and a selected choice is a 10% coral
  // tint under ink, so no text sits white on coral (3.36:1).
  it.each([
    ['white on ink (primary button)', () => WHITE, () => token('--color-ink')],
    ['white on ink-muted (primary button hover)', () => WHITE, () => token('--color-ink-muted')],
    ['ink on coral at 10% over white (selected choice)', () => token('--color-ink'), () => tintOver(token('--color-coral'), 0.1, WHITE)],
    ['ink on coral at 10% over surface (selected segment)', () => token('--color-ink'), () => tintOver(token('--color-coral'), 0.1, token('--color-surface'))],
    ['ink-muted on coral at 10% over white (selected saved splash zone detail)', () => token('--color-ink-muted'), () => tintOver(token('--color-coral'), 0.1, WHITE)],
    ['white on error (destructive button hover)', () => WHITE, () => token('--color-error')],
    ['error on white (destructive button)', () => token('--color-error'), () => WHITE],
  ])('%s clears WCAG AA 4.5:1', (_, foreground, background) => {
    expect(contrastRatio(foreground(), background())).toBeGreaterThanOrEqual(4.5)
  })

  it('would catch white on coral', () => {
    expect(contrastRatio(WHITE, token('--color-coral'))).toBeLessThan(4.5)
  })

  it('composites a tint over its base', () => {
    expect(tintOver('#000000', 0.1, WHITE)).toBe('#e6e6e6')
  })
})

describe('micro text size', () => {
  it('is 12px in theme.css', () => {
    expect(tokenValueInThemeCss('--text-micro')).toBe('12px')
  })
})

const TEXT_ROLES = [
  't-display',
  't-h2',
  't-h3',
  't-subhead',
  't-wordmark',
  't-lead',
  't-body',
  't-field',
  't-meta',
  't-note',
  't-error',
  't-eyebrow',
  't-action',
  't-tag',
] as const

function utilityBody(name: string): string | undefined {
  return new RegExp(`^@utility ${name}\\s*\\{([^}]*)\\}`, 'm').exec(themeCss)?.[1]
}

describe('text roles', () => {
  it.each(TEXT_ROLES)('%s is an @utility in theme.css', (role) => {
    expect(utilityBody(role)).toBeDefined()
  })

  it('defines exactly the fourteen roles', () => {
    const defined = [...themeCss.matchAll(/^@utility (t-[\w-]+)/gm)].map((match) => match[1])
    expect(defined).toEqual([...TEXT_ROLES])
  })

  it.each(['t-meta', 't-note', 't-field'])('%s sets letter-spacing: normal', (role) => {
    expect(utilityBody(role)).toMatch(/letter-spacing:\s*normal;/)
  })
})
