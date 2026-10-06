import { describe, expect, it, vi } from 'vitest'

vi.mock('../analytics/index', () => ({ trackPageView: vi.fn() }))
vi.mock('../views/CoverPage.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/NotFoundView.vue', () => ({ default: { template: '<div />' } }))

import { router } from '../router/index'
import { DISALLOWED_PATHS, robotsTxt } from './robots'

// Robots matching is a plain prefix match on the path.
function disallowed(path: string): boolean {
  return DISALLOWED_PATHS.some((prefix) => path.startsWith(prefix))
}

describe('robotsTxt', () => {
  it('lets every crawler in, keeps it out of the private pages, and names the sitemap on the requesting host', () => {
    expect(robotsTxt('https://sparks-effect.app')).toBe(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /authoring',
        'Disallow: /login',
        'Disallow: /account',
        'Disallow: /admin',
        'Disallow: /welcome',
        'Disallow: /set-password',
        'Disallow: /api/',
        '',
        'Sitemap: https://sparks-effect.app/sitemap.xml',
        '',
      ].join('\n'),
    )
  })

  it('names the sitemap on whichever host asked, since production is a promoted staging build', () => {
    expect(robotsTxt('https://dev.sparks-effect.app')).toContain('Sitemap: https://dev.sparks-effect.app/sitemap.xml')
  })

  it('disallows every page that needs a session, and every page that carries a sign-in token', () => {
    const privatePaths = router
      .getRoutes()
      .filter((route) => route.meta.requiresAuth || ['login', 'welcome'].includes(String(route.name)))
      .map((route) => route.path)
    expect(privatePaths.length).toBeGreaterThan(5)
    for (const path of [...privatePaths, '/set-password']) {
      expect(disallowed(path), path).toBe(true)
    }
  })

  it('keeps crawlers off the functions behind /robots.txt and /sitemap.xml, which would be duplicates', () => {
    for (const path of ['/api/robots', '/api/sitemap']) expect(disallowed(path), path).toBe(true)
  })

  it('leaves every public page crawlable', () => {
    for (const path of ['/', '/scenario/ca-hsr', '/services/northbound-express', '/routes/main-line', '/robots.txt', '/sitemap.xml']) {
      expect(disallowed(path), path).toBe(false)
    }
  })
})
