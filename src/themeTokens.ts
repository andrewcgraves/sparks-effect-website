export const THEME_TOKEN_FALLBACKS = {
  '--color-data-origin': '#1034b1',
  '--color-data-egress': '#f28f29',
  '--color-ink': '#121212',
  '--color-ink-muted': '#4a4a4f',
  '--color-coral': '#e1665b',
} as const

export type ThemeTokenName = keyof typeof THEME_TOKEN_FALLBACKS

export function readThemeToken(name: ThemeTokenName): string {
  const fallback = THEME_TOKEN_FALLBACKS[name]
  if (typeof getComputedStyle !== 'function') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}
