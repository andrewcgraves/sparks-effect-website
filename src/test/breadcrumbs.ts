import type { VueWrapper } from '@vue/test-utils'

export function breadcrumbTrail(wrapper: VueWrapper): [string, string | null][] {
  return wrapper
    .findAll('nav[aria-label="Breadcrumb"] li > :not([aria-hidden])')
    .map((crumb) => [crumb.text(), crumb.attributes('href') ?? null])
}
