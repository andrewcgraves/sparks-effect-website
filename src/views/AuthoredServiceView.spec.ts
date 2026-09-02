import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Service, TransitGraph } from '../api/authoring/types'
import { ApiError } from '../api/authoring/client'

vi.mock('../api/authoring/services', () => ({
  fetchService: vi.fn(),
  fetchServiceGraph: vi.fn(),
  compileService: vi.fn(),
  fetchServiceIsochrone: vi.fn(),
}))
vi.mock('../components/MapView.vue', () => ({
  default: {
    props: ['origin', 'isochroneData', 'loading', 'routes', 'stations', 'services'],
    template: '<div data-testid="map" :data-stations="stations.length" :data-routes="routes.length" />',
  },
}))

import AuthoredServiceView from './AuthoredServiceView.vue'
import { compileService, fetchService, fetchServiceGraph, fetchServiceIsochrone } from '../api/authoring/services'

const Stub = { template: '<div>stub</div>' }

// A compiled single-service graph: one service, its stops as nodes, and the
// route the API bundles onto the read so the map can follow the alignment.
const graph = {
  // Each hop compiles with its return leg; the two differ by the dwell at the
  // stop each one arrives at.
  services: [{
    service_id: 'svc1',
    wait_secs: 0,
    edges: [
      { from_slug: 'a', to_slug: 'b', seconds: 60 },
      { from_slug: 'b', to_slug: 'a', seconds: 75 },
    ],
  }],
  nodes: [
    { slug: 'a', lat: 37.7, lng: -122.4, names: ['Union'] },
    { slug: 'b', lat: 37.5, lng: -122.1, names: ['Midtown'] },
  ],
  routes: [{
    id: 'route-1', slug: 'main-line', name: 'Main Line', mode: 'rail', bidirectional: true,
    geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-122.1, 37.5]] }, segments: [],
  }],
} as unknown as TransitGraph

const stubService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'route-1',
  name: 'Northbound Express',
  description: 'Runs the spine',
  stops: [
    { name: 'Union', lat: 37.7, lng: -122.4, seq: 0 },
    { name: 'Midtown', lat: 37.5, lng: -122.1, seq: 1 },
  ],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1.1, deceleration_ms2: 1.2, dwell_s: 30 },
  frequency_windows: [{ start_time: '06:00', end_time: '22:00', headway_s: 900 }],
}

function mountView(slug = 'northbound-express') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/authoring', name: 'authoring', component: Stub },
      { path: '/authoring/services/:slug', name: 'service-detail', component: AuthoredServiceView, props: true },
    ],
  })
  return mount(AuthoredServiceView, { props: { slug }, global: { plugins: [router] } })
}

describe('AuthoredServiceView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchService).mockReset()
    vi.mocked(fetchServiceGraph).mockReset().mockResolvedValue(graph)
    vi.mocked(compileService).mockReset()
    vi.mocked(fetchServiceIsochrone).mockReset()
    // useCompileJob polls the job endpoint through the jobs store.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'job1', kind: 'compile_user_service', status: 'succeeded', result: graph }),
    } as Response))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches the service named by the slug prop', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    mountView()
    await flushPromises()
    expect(fetchService).toHaveBeenCalledWith('northbound-express')
  })

  it('shows the name and slug once loaded', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Northbound Express')
    expect(wrapper.text()).toContain('northbound-express')
  })

  it('lists the stops in order', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="service-stop-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Union')
    expect(rows[1].text()).toContain('Midtown')
  })

  it('orders stops by seq rather than array order', async () => {
    vi.mocked(fetchService).mockResolvedValue({
      ...stubService,
      stops: [
        { name: 'Midtown', lat: 37.5, lng: -122.1, seq: 1 },
        { name: 'Union', lat: 37.7, lng: -122.4, seq: 0 },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="service-stop-row"]')
    expect(rows[0].text()).toContain('Union')
    expect(rows[1].text()).toContain('Midtown')
  })

  it('shows empty states for a service with no stops or frequency windows', async () => {
    vi.mocked(fetchService).mockResolvedValue({ ...stubService, stops: [], frequency_windows: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="service-stops-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="service-windows-empty"]').exists()).toBe(true)
  })

  it('shows the vehicle params and frequency windows', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('320')
    expect(wrapper.findAll('[data-testid="service-window-row"]')).toHaveLength(1)
  })

  it('links back to the authoring page', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="back-to-authoring"]').attributes('href')).toBe('/authoring')
  })

  it('shows a not-found state on a 404', async () => {
    vi.mocked(fetchService).mockRejectedValue(new ApiError('not found', 404))
    const wrapper = mountView('no-such-service')
    await flushPromises()
    expect(wrapper.find('[data-testid="service-not-found"]').exists()).toBe(true)
  })

  it('shows an error state on a non-404 failure', async () => {
    vi.mocked(fetchService).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="service-error"]').exists()).toBe(true)
  })

  // --- render: map and isochrone (SPA-141) ---

  it('reads the compiled graph and shows the map without recompiling', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    expect(fetchServiceGraph).toHaveBeenCalledWith('northbound-express')
    // The graph is persisted on the job row, so a normal visit is one cached
    // read — recompiling every visit would be pure waste.
    expect(compileService).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'IsochroneForm' }).exists()).toBe(true)
  })

  it('shows time between stations for the service it compiled', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()

    const section = wrapper.get('[data-testid="time-between-stations"]')
    expect(section.get('[data-testid="station-time-group-label"]').text()).toBe('Northbound Express')
    expect(section.get('[data-testid="station-time-row"]').findAll('td').map((td) => td.text()))
      .toEqual(['Union', 'Midtown', '1:00'])
  })

  it('keeps the run times beside the stops and vehicle cards, not below them', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    // One flowing grid of cards, so they slot in side by side when there's room.
    const grid = wrapper.get('[data-testid="time-between-stations"]').element.parentElement
    expect(grid?.className).toContain('grid')
    expect(grid?.querySelectorAll('[data-testid="service-stop-row"]').length).toBeGreaterThan(0)
  })

  it('drops the run-time section when the graph never arrives, rather than loading for good', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    vi.mocked(fetchServiceGraph).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="time-between-stations"]').exists()).toBe(false)
    // The stops and vehicle cards are unaffected.
    expect(wrapper.find('[data-testid="service-stop-row"]').exists()).toBe(true)
  })

  it('shows the return leg\'s own run time when the other terminus is chosen', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('[data-testid="direction-toggle"]')[1].trigger('click')
    expect(wrapper.get('[data-testid="station-time-row"]').findAll('td').map((td) => td.text()))
      .toEqual(['Midtown', 'Union', '1:15'])
  })

  it('draws the service along its route alignment, not chords between stops', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    const map = wrapper.find('[data-testid="map"]')
    // The mock MapView reflects its layer counts as data attributes.
    expect(map.attributes('data-stations')).toBe('2')
    expect(map.attributes('data-routes')).toBe('1')
  })

  it('compiles when the service has never compiled, without flashing an error', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    vi.mocked(fetchServiceGraph).mockRejectedValue(new ApiError('no compiled graph', 404))
    vi.mocked(compileService).mockResolvedValue({ id: 'job1', kind: 'compile_user_service', status: 'queued' })
    const wrapper = mountView()
    await flushPromises()
    expect(compileService).toHaveBeenCalledWith('northbound-express', expect.any(Object))
    expect(wrapper.find('[data-testid="graph-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(true)
  })

  it('plots an isochrone against the service', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    vi.mocked(fetchServiceIsochrone).mockResolvedValue({ features: [] } as never)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 37.7, lng: -122.4, duration: 30, mode: 'walk',
    })
    await flushPromises()

    expect(fetchServiceIsochrone).toHaveBeenCalledWith('northbound-express', {
      lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk',
    })
  })

  it('forwards transit mode when plotting an isochrone', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    vi.mocked(fetchServiceIsochrone).mockResolvedValue({ features: [] } as never)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 37.7, lng: -122.4, duration: 30, mode: 'transit',
    })
    await flushPromises()

    expect(fetchServiceIsochrone).toHaveBeenCalledWith('northbound-express', {
      lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'transit',
    })
  })

  // Editing the service leaves its graph stale; the shared composable's retry
  // recovers transparently rather than surfacing it to the user.
  it('recovers from a stale_graph 409 by recompiling and retrying', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    vi.mocked(compileService).mockResolvedValue({ id: 'job1', kind: 'compile_user_service', status: 'queued' })
    vi.mocked(fetchServiceIsochrone)
      .mockRejectedValueOnce(new ApiError('stale', 409, 'stale_graph'))
      .mockResolvedValueOnce({ features: [] } as never)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 37.7, lng: -122.4, duration: 30, mode: 'walk',
    })
    await flushPromises()

    expect(compileService).toHaveBeenCalledWith('northbound-express', expect.any(Object))
    expect(fetchServiceIsochrone).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="graph-error"]').exists()).toBe(false)
  })

  it('reports a graph read that fails for a reason other than "never compiled"', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    vi.mocked(fetchServiceGraph).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(compileService).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="graph-error"]').exists()).toBe(true)
  })

  it('reports a failed compile instead of an unusable form', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    vi.mocked(fetchServiceGraph).mockRejectedValue(new ApiError('no compiled graph', 404))
    vi.mocked(compileService).mockRejectedValue(new ApiError('compile boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="compile-error"]').exists()).toBe(true)
  })

  // A service with no stops still has a page; the map just has no geometry.
  it('renders a service with no stops without crashing', async () => {
    vi.mocked(fetchService).mockResolvedValue({ ...stubService, stops: [] })
    vi.mocked(fetchServiceGraph).mockResolvedValue({ services: [] } as unknown as TransitGraph)
    const wrapper = mountView()
    await flushPromises()
    const map = wrapper.find('[data-testid="map"]')
    expect(map.exists()).toBe(true)
    expect(map.attributes('data-stations')).toBe('0')
    expect(map.attributes('data-routes')).toBe('0')
    expect(wrapper.find('[data-testid="service-stops-empty"]').exists()).toBe(true)
  })

  // The render is the reason the page gets opened, so it sits above the text.
  it('puts the map above the stops and vehicle sections', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    // findAll returns document order, so the first hit tells us which came first.
    const ordered = wrapper.findAll('[data-testid="map"], [data-testid="service-stop-row"]')
    expect(ordered[0].attributes('data-testid')).toBe('map')
  })
})
