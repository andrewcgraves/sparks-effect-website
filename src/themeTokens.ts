/* MapLibre paints to WebGL and cannot read CSS variables, so the layers it draws
   resolve their colours to hex once at map init. theme.css is the single source of
   truth for the values; the fallbacks below exist only for environments with no
   stylesheet (jsdom), and themeTokens.spec.ts parses theme.css to prove they still
   agree with it. */
export const THEME_TOKEN_FALLBACKS = {
  '--color-data-origin': '#1034b1',
  '--color-data-egress': '#f28f29',
  '--color-ink': '#121212',
  '--color-coral': '#e1665b',
} as const

export type ThemeTokenName = keyof typeof THEME_TOKEN_FALLBACKS

export function readThemeToken(name: ThemeTokenName): string {
  const fallback = THEME_TOKEN_FALLBACKS[name]
  if (typeof getComputedStyle !== 'function') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}
