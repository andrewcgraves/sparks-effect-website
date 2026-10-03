import { watchEffect } from 'vue'

export const SITE_NAME = 'Sparks Effect'

export function formatPageTitle(name?: string | null): string {
  return name ? `${name} · ${SITE_NAME}` : SITE_NAME
}

// The router sets each route's `meta.title` on every navigation; this replaces
// it once the page's own data names it. Until then — and if the name never
// arrives — the route's title stands, so a failed load still has a tab label.
export function usePageTitle(name: () => string | null | undefined): void {
  watchEffect(() => {
    const value = name()
    if (value) document.title = formatPageTitle(value)
  })
}
