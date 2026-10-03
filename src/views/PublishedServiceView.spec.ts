import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { homeOnlyRouter } from '../test/router'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../api/authoring/client'
import type { ServicePublication } from '../api/publications'
import type { ChainResponse } from '../fixtures/isochrone'

vi.mock('../api/publications', () => ({
  fetchServicePublication: vi.fn(),
  fetchPublicationIsochrone: vi.fn(),
}))
vi.mock('../api/authoring/services', () => ({
  compileService: vi.fn(),
  fetchService: vi.fn(),
  fetchServiceGraph: vi.fn(),
  fetchServiceIsochrone: vi.fn(),
}))
vi.mock('../components/MapView.vue', () => ({
  default: {
    props: ['origin', 'isochroneData', 'loading', 'routes', 'stations'],
    template: '<div data-testid="map" :data-stations="stations.length" :data-routes="routes.length" />',
  },
}))

import PublishedServiceView from './PublishedServiceView.vue'
import { fetchPublicationIsochrone, fetchServicePublication } from '../api/publications'
import { compileService, fetchService, fetchServiceGraph, fetchServiceIsochrone } from '../api/authoring/services'
import { busyRegion, visibleText } from '../test/loading'

const publication: ServicePublication = {
  user_service_id: 'svc1',
  compile_job_id: 'job1',
  name: 'Northbound Express',
  subtext: 'Electrified · Regional rail',
  description: 'Runs the spine.\n\nStops at every town.',
  published_at: '2026-09-27T12:00:00Z',
  services: [{
    service_id: 'svc1',
    wait_secs: 0,
    edges: [
      { from_slug: 'a', to_slug: 'b', seconds: 60 },
      { from_slug: 'b', to_slug: 'a', seconds: 75 },
      { from_slug: 'b', to_slug: 'c', seconds: 90 },
      { from_slug: 'c', to_slug: 'b', seconds: 95 },
    ],
  }],
  nodes: [
    { slug: 'c', lat: 37.9, lng: -122.3, names: ['Uptown'] },
    { slug: 'a', lat: 37.7, lng: -122.4, names: ['Union'] },
    { slug: 'b', lat: 37.5, lng: -122.1, names: ['Midtown'] },
  ],
  routes: [{
    id: 'route-1', slug: 'main-line', name: 'Main Line', mode: 'rail', bidirectional: true,
    geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-122.1, 37.5]] }, segments: [],
  }],
}

const plot = {
  type: 'FeatureCollection',
  features: [],
  metadata: {
    reachable_stations: [
      { station_slug: 'a', access_mins: 5, access_secs: 300, remaining_mins: 25, remaining_secs: 1500 },
    ],
    origin_budget_mins: 30,
    compile_job_id: 'job1',
    mode: 'walk',
    wait_model: 'headway_over_2_peak',
    origin_iso_available: true,
  },
} as ChainResponse

const submit = { lat: 37.7, lng: -122.4, duration: 30, mode: 'walk' }

function mountView(slug = 'northbound-express') {
  return mount(PublishedServiceView, { props: { slug }, global: { plugins: [homeOnlyRouter()] } })
}

describe('PublishedServiceView', () => {
  const fetchSpy = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchServicePublication).mockReset().mockResolvedValue(publication)
    vi.mocked(fetchPublicationIsochrone).mockReset().mockResolvedValue(plot)
    vi.mocked(compileService).mockReset()
    // Every request this page makes goes through the mocked modules; anything
    // reaching fetch — a compile, a job poll — is a request it must not make.
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
  })

  it('shows a page skeleton in the shape of the loaded page, not loading copy, while it loads', () => {
    vi.mocked(fetchServicePublication).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    const region = busyRegion(wrapper, 'service-loading')
    expect(region.find('[data-testid="map-panel-skeleton"]').exists()).toBe(true)
    expect(region.findAll('[data-testid="card-skeleton"]')).toHaveLength(2)
    expect(visibleText(region)).toBe('')
  })

  it('links back to all lines', () => {
    expect(mountView().get('[data-testid="back-to-lines"]').attributes('href')).toBe('/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reads the publication named by the slug, and only that', async () => {
    mountView()
    await flushPromises()
    expect(fetchServicePublication).toHaveBeenCalledWith('northbound-express')
    // The draft reads are the owner's, and need a session this reader lacks.
    expect(fetchService).not.toHaveBeenCalled()
    expect(fetchServiceGraph).not.toHaveBeenCalled()
  })

  it('names the tab after the published service once it loads', async () => {
    mountView()
    await flushPromises()
    expect(document.title).toBe('Northbound Express · Sparks Effect')
  })

  it('shows the title, subtext and description', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Northbound Express')
    expect(wrapper.get('[data-testid="service-subtext"]').text()).toBe('Electrified · Regional rail')
    expect(wrapper.get('[data-testid="service-description"]').text()).toBe('Runs the spine.\n\nStops at every town.')
  })

  it('leaves out prose the publication does not have', async () => {
    vi.mocked(fetchServicePublication).mockResolvedValue({ ...publication, subtext: undefined, description: undefined })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="service-subtext"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="service-description"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Description')
  })

  it('carries none of the seeded page\'s placeholder copy', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Greenfield')
    expect(wrapper.text()).not.toContain('Technology assumptions')
    expect(wrapper.text()).not.toContain('Placeholder')
  })

  it('draws the alignment and stations', async () => {
    const wrapper = mountView()
    await flushPromises()
    const map = wrapper.get('[data-testid="map"]')
    expect(map.attributes('data-stations')).toBe('3')
    expect(map.attributes('data-routes')).toBe('1')
  })

  it('lists the stops in the order the service runs, not the order of the nodes', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('[data-testid="service-stop-row"]').map((row) => row.text()))
      .toEqual(['1. Union', '2. Midtown', '3. Uptown'])
  })

  it('lists the one station of a service with a single stop', async () => {
    vi.mocked(fetchServicePublication).mockResolvedValue({
      ...publication,
      services: [{ service_id: 'svc1', wait_secs: 0, edges: [] }],
      nodes: [{ slug: 'a', lat: 37.7, lng: -122.4, names: ['Union'] }],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('[data-testid="service-stop-row"]').map((row) => row.text())).toEqual(['1. Union'])
  })

  it('shows time between stations from the published graph', async () => {
    const wrapper = mountView()
    await flushPromises()
    const rows = wrapper.get('[data-testid="time-between-stations"]').findAll('[data-testid="station-time-row"]')
    expect(rows[0].findAll('td').map((td) => td.text())).toEqual(['Union', 'Midtown', '1:00'])
  })

  it('plots over the publication and draws the time-remaining graph', async () => {
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', submit)
    await flushPromises()

    expect(fetchPublicationIsochrone).toHaveBeenCalledWith('northbound-express', {
      lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk',
    })
    expect(fetchServiceIsochrone).not.toHaveBeenCalled()
    const graph = wrapper.findComponent({ name: 'TimeRemaining' })
    expect(graph.exists()).toBe(true)
    expect(graph.text()).toContain('Union')
  })

  describe('not found', () => {
    // The API answers unpublished and unknown with the same 404; the page must
    // not undo that by wording the two differently.
    it('shows the same not-found page for an unpublished slug as for an unknown one', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('service not found', 404))
      const unpublished = mountView('a-draft')
      await flushPromises()
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('service not found', 404))
      const unknown = mountView('no-such-thing')
      await flushPromises()

      expect(unpublished.find('[data-testid="service-not-found"]').exists()).toBe(true)
      expect(unpublished.text().replace('a-draft', 'SLUG')).toBe(unknown.text().replace('no-such-thing', 'SLUG'))
      expect(unpublished.find('[data-testid="map"]').exists()).toBe(false)
    })

    it('says only that nothing is published there', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('service not found', 404))
      const wrapper = mountView('northbound-express')
      await flushPromises()
      const copy = wrapper.get('[data-testid="service-not-found"]').text()
      expect(copy).toContain('published')
      expect(copy).not.toMatch(/unpublished|draft|yours|exist/i)
    })

    it('shows an error rather than not-found for any other failure', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('boom', 500))
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="service-error"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="service-not-found"]').exists()).toBe(false)
    })
  })

  describe('never compiles', () => {
    it('does not compile a slug that is not published', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('service not found', 404))
      mountView()
      await flushPromises()
      expect(compileService).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('does not recompile or retry on a stale_graph', async () => {
      vi.mocked(fetchPublicationIsochrone).mockRejectedValue(new ApiError('stale', 409, 'stale_graph'))
      const wrapper = mountView()
      await flushPromises()

      wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', submit)
      await flushPromises()

      expect(fetchPublicationIsochrone).toHaveBeenCalledTimes(1)
      expect(compileService).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
  })
})
