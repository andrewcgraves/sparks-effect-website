/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { THEME_TOKEN_FALLBACKS, readThemeToken, type ThemeTokenName } from './themeTokens'

const themeCss = readFileSync(resolve(process.cwd(), 'src/theme.css'), 'utf8')

function tokenValueInThemeCss(name: string): string | undefined {
  return new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(themeCss)?.[1].trim()
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
