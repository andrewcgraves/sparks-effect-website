import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Scenario, TransitGraph } from '../api/authoring/types'
import { ApiError } from '../api/authoring/client'

vi.mock('../api/authoring/scenarios', () => ({
  fetchScenario: vi.fn(),
  fetchScenarioGraph: vi.fn(),
  compileScenario: vi.fn(),
  fetchScenarioIsochrone: vi.fn(),
}))
vi.mock('../api/authoring/services', () => ({
  fetchMyServices: vi.fn(),
}))
vi.mock('../components/MapView.vue', () => ({
  default: { props: ['origin', 'isochroneData', 'loading', 'routes', 'stations', 'services'], template: '<div data-testid="map" />' },
}))

import AuthoredScenarioView from './AuthoredScenarioView.vue'
import {
  fetchScenario,
  fetchScenarioGraph,
  compileScenario,
  fetchScenarioIsochrone,
} from '../api/authoring/scenarios'
import { fetchMyServices } from '../api/authoring/services'

const Stub = { template: '<div>stub</div>' }

const stubScenario: Scenario = {
  id: 's1',
  slug: 'ca-hsr',
  name: 'CA HSR',
  description: 'California High-Speed Rail',
  service_ids: ['svc1'],
}

const graph = {
  services: [],
  merge: {
    clusters: [{ key: 'c1', names: ['Union', 'Union Sq'] }],
    near_misses: [{
      a: { name: 'Union', service_id: 'svc1' },
      b: { name: 'Midtown', service_id: 'svc2' },
      distance_m: 120.4,
    }],
  },
} as unknown as TransitGraph

function mountView(slug = 'ca-hsr') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/authoring', name: 'authoring', component: Stub },
      { path: '/authoring/scenarios/:slug', name: 'scenario-detail', component: AuthoredScenarioView, props: true },
    ],
  })
  return mount(AuthoredScenarioView, { props: { slug }, global: { plugins: [router] } })
}

describe('AuthoredScenarioView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchScenario).mockReset().mockResolvedValue(stubScenario)
    vi.mocked(fetchScenarioGraph).mockReset().mockResolvedValue(graph)
    vi.mocked(compileScenario).mockReset()
    vi.mocked(fetchMyServices).mockReset().mockResolvedValue([
      { id: 'svc2', slug: 'midtown-local', route_id: 'r1', name: 'Midtown Local', stops: [], vehicle: { max_speed_kmh: 100, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 }, frequency_windows: [] },
    ])
    vi.mocked(fetchScenarioIsochrone).mockReset()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'succeeded', result: graph }),
    } as Response))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads the scenario named by the slug prop and shows its name', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(fetchScenario).toHaveBeenCalledWith('ca-hsr')
    expect(wrapper.text()).toContain('CA HSR')
    expect(wrapper.text()).toContain('ca-hsr')
  })

  it('shows the map and isochrone form for a scenario that already compiled', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(fetchScenarioGraph).toHaveBeenCalledWith('ca-hsr')
    expect(compileScenario).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'IsochroneForm' }).exists()).toBe(true)
  })

  it('compiles when the scenario has no graph yet', async () => {
    vi.mocked(fetchScenarioGraph).mockRejectedValue(new ApiError('no compiled graph', 404))
    vi.mocked(compileScenario).mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' })
    const wrapper = mountView()
    await flushPromises()
    expect(compileScenario).toHaveBeenCalledWith('ca-hsr')
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(true)
  })

  it('plots an isochrone against the scenario', async () => {
    vi.mocked(fetchScenarioIsochrone).mockResolvedValue({ features: [] } as never)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 37.7, lng: -122.4, duration: 30, mode: 'walk',
    })
    await flushPromises()

    expect(fetchScenarioIsochrone).toHaveBeenCalledWith('ca-hsr', {
      lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk',
    })
  })

  it('shows the near-miss and realised-interchange reports from the graph', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('[data-testid="near-miss-row"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="realised-cluster-row"]')).toHaveLength(1)
    // Resolved from the owner's services; the unresolvable one falls back to its id.
    expect(wrapper.find('[data-testid="near-miss-row"]').text()).toContain('Midtown Local')
    expect(wrapper.find('[data-testid="near-miss-row"]').text()).toContain('svc1')
  })

  it('links back to the authoring page', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="back-to-authoring"]').attributes('href')).toBe('/authoring')
  })

  it('shows a not-found state on a 404 rather than a blank page', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new ApiError('not found', 404))
    const wrapper = mountView('no-such-scenario')
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-not-found"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(false)
  })

  it('shows an error state on a non-404 failure', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-error"]').exists()).toBe(true)
  })

  it('reports a failed compile instead of an unusable form', async () => {
    vi.mocked(fetchScenarioGraph).mockRejectedValue(new ApiError('no compiled graph', 404))
    vi.mocked(compileScenario).mockRejectedValue(new ApiError('compile boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="compile-error"]').exists()).toBe(true)
  })
})
