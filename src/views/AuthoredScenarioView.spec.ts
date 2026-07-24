import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Scenario, Service } from '../api/authoring/types'
import { ApiError } from '../api/authoring/client'

vi.mock('../api/authoring/scenarios', () => ({
  fetchScenario: vi.fn(),
}))
vi.mock('../api/authoring/services', () => ({
  fetchMyServices: vi.fn(),
}))

import AuthoredScenarioView from './AuthoredScenarioView.vue'
import { fetchScenario } from '../api/authoring/scenarios'
import { fetchMyServices } from '../api/authoring/services'

const Stub = { template: '<div>stub</div>' }

const stubService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'route-1',
  name: 'Northbound Express',
  stops: [],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 },
  frequency_windows: [],
}

const stubScenario: Scenario = {
  id: 's1',
  slug: 'ca-hsr',
  name: 'CA HSR',
  description: 'California High-Speed Rail',
  service_ids: ['svc1', 'svc-unknown'],
}

function mountView(slug = 'ca-hsr') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/authoring', name: 'authoring', component: Stub },
      { path: '/authoring/services/:slug', name: 'service-detail', component: Stub },
      { path: '/authoring/scenarios/:slug', name: 'scenario-detail', component: AuthoredScenarioView, props: true },
    ],
  })
  return mount(AuthoredScenarioView, { props: { slug }, global: { plugins: [router] } })
}

describe('AuthoredScenarioView', () => {
  beforeEach(() => {
    vi.mocked(fetchScenario).mockReset()
    vi.mocked(fetchMyServices).mockReset()
    vi.mocked(fetchMyServices).mockResolvedValue([stubService])
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

  it('names each member service and links to it', async () => {
    vi.mocked(fetchScenario).mockResolvedValue(stubScenario)
    const wrapper = mountView()
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="scenario-member"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Northbound Express')
    expect(rows[0].find('a').attributes('href')).toBe('/authoring/services/northbound-express')
  })

  it('falls back to the raw id for a member service it cannot resolve', async () => {
    vi.mocked(fetchScenario).mockResolvedValue(stubScenario)
    const wrapper = mountView()
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="scenario-member"]')
    expect(rows[1].text()).toContain('svc-unknown')
    expect(rows[1].find('a').exists()).toBe(false)
  })

  it('still shows the scenario when the service lookup fails', async () => {
    vi.mocked(fetchScenario).mockResolvedValue(stubScenario)
    vi.mocked(fetchMyServices).mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('CA HSR')
    expect(wrapper.findAll('[data-testid="scenario-member"]')).toHaveLength(2)
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
  })

  it('shows an error state on a non-404 failure', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-error"]').exists()).toBe(true)
  })
})
