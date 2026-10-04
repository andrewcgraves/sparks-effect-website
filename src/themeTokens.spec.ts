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

describe('micro text size', () => {
  it('is 12px in theme.css', () => {
    expect(tokenValueInThemeCss('--text-micro')).toBe('12px')
  })
})
