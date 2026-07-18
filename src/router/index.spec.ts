import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../analytics/index', () => ({
  trackPageView: vi.fn(),
}))

vi.mock('../views/CoverPage.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/ScenarioView.vue', () => ({ default: { props: ['slug'], template: '<div />' } }))
vi.mock('../views/NotFoundView.vue', () => ({ default: { template: '<div />' } }))

import { router } from './index'
import { trackPageView } from '../analytics/index'

describe('router', () => {
  beforeEach(() => {
    vi.mocked(trackPageView).mockClear()
  })

  it('tracks a page view for /', async () => {
    await router.push('/')
    expect(trackPageView).toHaveBeenCalledWith('/')
  })

  it('tracks a page view for /scenario/:slug using the actual route path', async () => {
    await router.push('/scenario/ca-hsr')
    expect(trackPageView).toHaveBeenCalledWith('/scenario/ca-hsr')
  })

  it('tracks a page view for unmatched paths using the actual route path', async () => {
    await router.push('/nope')
    expect(trackPageView).toHaveBeenCalledWith('/nope')
  })
})
