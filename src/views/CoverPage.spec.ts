import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { ScenarioSummary } from '../api/scenarios'

vi.mock('../api/scenarios', () => ({
  fetchFeaturedScenarios: vi.fn(),
}))

import CoverPage from './CoverPage.vue'
import { fetchFeaturedScenarios } from '../api/scenarios'

const ScenarioStub = { template: '<div>scenario</div>' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'cover', component: CoverPage },
      { path: '/scenario/:slug', name: 'scenario', component: ScenarioStub },
    ],
  })
}

const stubScenario: ScenarioSummary = {
  slug: 'ca-hsr',
  name: 'CA HSR',
  description: 'California High-Speed Rail',
}

async function mountCover() {
  const router = makeRouter()
  await router.push('/')
  const wrapper = mount(CoverPage, { global: { plugins: [router] } })
  return { wrapper, router }
}

describe('CoverPage', () => {
  beforeEach(() => {
    vi.mocked(fetchFeaturedScenarios).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the hero heading', async () => {
    vi.mocked(fetchFeaturedScenarios).mockResolvedValue([])
    const { wrapper } = await mountCover()
    expect(wrapper.get('h1').text()).toBe('Sparks Effect')
  })

  it('renders the deploy smoke check marker', async () => {
    vi.mocked(fetchFeaturedScenarios).mockResolvedValue([])
    const { wrapper } = await mountCover()
    expect(wrapper.get('[data-testid="deploy-smoke-banner"]').text()).toContain(
      'Deploy smoke check',
    )
  })

  it('shows a loading state before the fetch resolves', async () => {
    vi.mocked(fetchFeaturedScenarios).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountCover()
    expect(wrapper.find('[data-testid="scenarios-loading"]').exists()).toBe(true)
  })

  it('lists each featured scenario once loaded, linking to its page', async () => {
    vi.mocked(fetchFeaturedScenarios).mockResolvedValue([stubScenario])
    const { wrapper } = await mountCover()
    await flushPromises()
    const link = wrapper.find('[data-testid="scenario-link"]')
    expect(link.attributes('href')).toBe('/scenario/ca-hsr')
    expect(link.text()).toContain('CA HSR')
  })

  it('shows an empty state when no scenarios are featured', async () => {
    vi.mocked(fetchFeaturedScenarios).mockResolvedValue([])
    const { wrapper } = await mountCover()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenarios-empty"]').exists()).toBe(true)
  })

  it('shows an error state when the fetch fails', async () => {
    vi.mocked(fetchFeaturedScenarios).mockRejectedValue(new Error('boom'))
    const { wrapper } = await mountCover()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenarios-error"]').exists()).toBe(true)
  })

  it('renders a footer with attribution', async () => {
    vi.mocked(fetchFeaturedScenarios).mockResolvedValue([])
    const { wrapper } = await mountCover()
    expect(wrapper.find('footer').exists()).toBe(true)
  })
})
