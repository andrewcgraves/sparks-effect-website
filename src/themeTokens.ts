export const THEME_TOKEN_FALLBACKS = {
  '--color-data-origin': '#e1665b',
  '--color-data-egress': '#ef9261',
  '--color-ink': '#121212',
  '--color-ink-muted': '#4a4a4f',
  '--color-ink-faint': '#b8b8be',
  '--color-coral': '#e1665b',
  '--color-apricot': '#ef9261',
  '--color-error': '#c2453b',
} as const

export type ThemeTokenName = keyof typeof THEME_TOKEN_FALLBACKS

export function readThemeToken(name: ThemeTokenName): string {
  const fallback = THEME_TOKEN_FALLBACKS[name]
  if (typeof getComputedStyle !== 'function') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}
