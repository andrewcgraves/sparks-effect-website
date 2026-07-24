import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Scenario } from '../api/authoring/types'
import { ApiError } from '../api/authoring/client'

vi.mock('../api/authoring/scenarios', () => ({
  fetchScenario: vi.fn(),
}))

import AuthoredScenarioView from './AuthoredScenarioView.vue'
import { fetchScenario } from '../api/authoring/scenarios'

const Stub = { template: '<div>stub</div>' }

const stubScenario: Scenario = {
  id: 's1',
  slug: 'ca-hsr',
  name: 'CA HSR',
  description: 'California High-Speed Rail',
  service_ids: ['svc1'],
}

function mountView(slug = 'ca-hsr') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/authoring', name: 'authoring', component: Stub },
      { path: '/scenario/:slug', name: 'scenario', component: Stub },
      { path: '/authoring/scenarios/:slug', name: 'scenario-detail', component: AuthoredScenarioView, props: true },
    ],
  })
  return mount(AuthoredScenarioView, { props: { slug }, global: { plugins: [router] } })
}

describe('AuthoredScenarioView', () => {
  beforeEach(() => {
    vi.mocked(fetchScenario).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the scenario named by the slug prop', async () => {
    vi.mocked(fetchScenario).mockResolvedValue(stubScenario)
    mountView()
    await flushPromises()
    expect(fetchScenario).toHaveBeenCalledWith('ca-hsr')
  })

  it('shows the name, slug, and description once loaded', async () => {
    vi.mocked(fetchScenario).mockResolvedValue(stubScenario)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('CA HSR')
    expect(wrapper.text()).toContain('ca-hsr')
    expect(wrapper.text()).toContain('California High-Speed Rail')
  })

  it('links to the public scenario page for isochrones', async () => {
    vi.mocked(fetchScenario).mockResolvedValue(stubScenario)
    const wrapper = mountView()
    await flushPromises()
    const link = wrapper.find('[data-testid="view-isochrones-link"]')
    expect(link.attributes('href')).toBe('/scenario/ca-hsr')
  })

  it('does not restate the scenario contents', async () => {
    vi.mocked(fetchScenario).mockResolvedValue(stubScenario)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-member"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('svc1')
  })

  it('links back to the authoring page', async () => {
    vi.mocked(fetchScenario).mockResolvedValue(stubScenario)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="back-to-authoring"]').attributes('href')).toBe('/authoring')
  })

  it('shows a not-found state on a 404', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new ApiError('not found', 404))
    const wrapper = mountView('no-such-scenario')
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-not-found"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="view-isochrones-link"]').exists()).toBe(false)
  })

  it('shows an error state on a non-404 failure', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-error"]').exists()).toBe(true)
  })
})
