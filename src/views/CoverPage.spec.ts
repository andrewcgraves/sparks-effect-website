import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { CoverCard, CoverIndex } from '../api/coverIndex'

vi.mock('../api/coverIndex', () => ({
  fetchCoverIndex: vi.fn(),
}))

import CoverPage from './CoverPage.vue'
import { fetchCoverIndex } from '../api/coverIndex'

const Stub = { template: '<div>page</div>' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'cover', component: CoverPage },
      { path: '/scenario/:slug', name: 'scenario', component: Stub },
      { path: '/services/:slug', name: 'published-service', component: Stub },
    ],
  })
}

const scenarioCard: CoverCard = {
  kind: 'scenario',
  slug: 'ca-hsr',
  name: 'CA HSR',
  caption: 'California High-Speed Rail',
  to: '/scenario/ca-hsr',
}

const serviceCard: CoverCard = {
  kind: 'service',
  slug: 'coast-line',
  name: 'Coast Line',
  caption: 'Electrified · Regional rail',
  to: '/services/coast-line',
}

function index(cards: CoverCard[], unavailable: CoverIndex['unavailable'] = []): CoverIndex {
  return { cards, unavailable }
}

async function mountCover() {
  const router = makeRouter()
  await router.push('/')
  const wrapper = mount(CoverPage, { global: { plugins: [router] } })
  return { wrapper, router }
}

describe('CoverPage', () => {
  beforeEach(() => {
    vi.mocked(fetchCoverIndex).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the hero heading', async () => {
    vi.mocked(fetchCoverIndex).mockResolvedValue(index([]))
    const { wrapper } = await mountCover()
    expect(wrapper.get('h1').text()).toBe('Sparks Effect')
  })

  it('shows a loading state before the fetch resolves', async () => {
    vi.mocked(fetchCoverIndex).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountCover()
    expect(wrapper.find('[data-testid="scenarios-loading"]').exists()).toBe(true)
  })

  it('links a curated scenario to its scenario page', async () => {
    vi.mocked(fetchCoverIndex).mockResolvedValue(index([scenarioCard]))
    const { wrapper } = await mountCover()
    await flushPromises()
    const link = wrapper.get('[data-testid="scenario-link"]')
    expect(link.attributes('href')).toBe('/scenario/ca-hsr')
    expect(link.text()).toContain('CA HSR')
    expect(link.text()).toContain('California High-Speed Rail')
  })

  it('links a published service to its public page', async () => {
    vi.mocked(fetchCoverIndex).mockResolvedValue(index([scenarioCard, serviceCard]))
    const { wrapper } = await mountCover()
    await flushPromises()
    const link = wrapper.get('[data-testid="service-link"]')
    expect(link.attributes('href')).toBe('/services/coast-line')
    expect(link.text()).toContain('Coast Line')
    expect(link.text()).toContain('Electrified · Regional rail')
  })

  it('renders a card with no caption without an empty caption line', async () => {
    vi.mocked(fetchCoverIndex).mockResolvedValue(index([{ ...serviceCard, caption: undefined }]))
    const { wrapper } = await mountCover()
    await flushPromises()
    expect(wrapper.get('[data-testid="service-link"]').find('span').exists()).toBe(false)
  })

  it('shows an empty state when both reads answer empty', async () => {
    vi.mocked(fetchCoverIndex).mockResolvedValue(index([]))
    const { wrapper } = await mountCover()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenarios-empty"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows an error state, not an empty one, when neither read answers', async () => {
    vi.mocked(fetchCoverIndex).mockRejectedValue(new Error('boom'))
    const { wrapper } = await mountCover()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenarios-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="scenarios-empty"]').exists()).toBe(false)
  })

  it('shows the half that answered and names the half that did not', async () => {
    vi.mocked(fetchCoverIndex).mockResolvedValue(index([scenarioCard], ['service']))
    const { wrapper } = await mountCover()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-link"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="scenarios-partial"]').text()).toBe("Couldn't load the published services.")
    expect(wrapper.find('[data-testid="scenarios-error"]').exists()).toBe(false)
  })

  it('does not claim nothing is published when the half that answered is empty', async () => {
    vi.mocked(fetchCoverIndex).mockResolvedValue(index([], ['scenario']))
    const { wrapper } = await mountCover()
    await flushPromises()
    expect(wrapper.get('[data-testid="scenarios-partial"]').text()).toBe("Couldn't load the curated scenarios.")
    expect(wrapper.find('[data-testid="scenarios-empty"]').exists()).toBe(false)
  })

  it('renders a footer with attribution', async () => {
    vi.mocked(fetchCoverIndex).mockResolvedValue(index([]))
    const { wrapper } = await mountCover()
    expect(wrapper.find('footer').exists()).toBe(true)
  })
})
