export const SITE_NAME = 'Sparks Effect'

export function formatPageTitle(name?: string | null): string {
  return name ? `${name} · ${SITE_NAME}` : SITE_NAME
}
