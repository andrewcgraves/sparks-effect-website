import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ServiceView from './ServiceView.vue'

vi.mock('../analytics/index', () => ({
  trackPageView: vi.fn(),
}))

vi.mock('../api/isochrone', () => ({
  fetchIsochrone: vi.fn(),
}))

vi.mock('../composables/useScenario', () => ({
  useScenario: () => ({
    name: ref('CA HSR'),
    description: ref('California High-Speed Rail'),
    routes: ref([]),
    stations: ref([]),
    services: ref([]),
    error: ref(null),
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/service/ca-hsr' }),
}))

import { trackPageView } from '../analytics/index'
import { fetchIsochrone } from '../api/isochrone'
import type { ChainResponse } from '../fixtures/isochrone'

const stubIsochrone: ChainResponse = {
  type: 'FeatureCollection',
  features: [],
  metadata: {
    reachable_stations: [],
    origin_budget_mins: 30,
    scenario_slug: 'ca-hsr',
    mode: 'walk',
    wait_model: 'half-headway',
    origin_iso_available: true,
  },
}

function mountView() {
  return mount(ServiceView, {
    props: { slug: 'ca-hsr' },
    global: { stubs: { MapView: true, IsochroneForm: true, SpeedGraph: true } },
  })
}

describe('ServiceView', () => {
  beforeEach(() => {
    vi.mocked(trackPageView).mockClear()
    vi.mocked(fetchIsochrone).mockClear()
  })

  it('renders the scenario name as the heading', () => {
    const wrapper = mountView()
    expect(wrapper.get('h1').text()).toBe('CA HSR')
  })

  it('tracks a page view on mount with the current path', () => {
    mountView()
    expect(trackPageView).toHaveBeenCalledOnce()
    expect(trackPageView).toHaveBeenCalledWith('/service/ca-hsr')
  })

  it('sets the document title from the scenario name', () => {
    mountView()
    expect(document.title).toBe('CA HSR — Sparks Effect')
  })

  it('passes null isochroneData and loading=false to MapView before any submission', () => {
    const wrapper = mountView()
    const mapView = wrapper.findComponent({ name: 'MapView' })
    expect(mapView.props('isochroneData')).toBeNull()
    expect(mapView.props('loading')).toBe(false)
  })

  it('calls fetchIsochrone with the form payload and route slug on submit', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const wrapper = mountView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'walk',
    })
    expect(fetchIsochrone).toHaveBeenCalledOnce()
    expect(fetchIsochrone).toHaveBeenCalledWith({
      lat: 51.5074,
      lng: -0.1278,
      budget_mins: 30,
      mode: 'walk',
      scenario_slug: 'ca-hsr',
    })
  })

  it('forwards the selected mode from the form payload to fetchIsochrone', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const wrapper = mountView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'bike',
    })
    expect(fetchIsochrone).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'bike' }),
    )
  })

  it('sets loading=true on MapView while the fetch is in flight', async () => {
    let resolveIsochrone!: (v: ChainResponse) => void
    vi.mocked(fetchIsochrone).mockReturnValue(
      new Promise<ChainResponse>((res) => { resolveIsochrone = res }),
    )
    const wrapper = mountView()
    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'walk',
    })
    await vi.waitFor(() => {
      expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(true)
    })
    resolveIsochrone(stubIsochrone)
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
  })

  it('passes isochrone data to MapView after successful fetch', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const wrapper = mountView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'walk',
    })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MapView' }).props('isochroneData')).toEqual(stubIsochrone)
    expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
  })

  it('clears loading state and shows an error message when the fetch throws', async () => {
    vi.mocked(fetchIsochrone).mockRejectedValue(new Error('API down'))
    const wrapper = mountView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'walk',
    })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
    expect(wrapper.find('[data-testid="fetch-error"]').exists()).toBe(true)
  })

  it('passes origin to MapView when IsochroneForm emits origin-change', async () => {
    const wrapper = mountView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', { lat: 51.5074, lng: -0.1278 })
    expect(wrapper.findComponent({ name: 'MapView' }).props('origin')).toEqual({ lat: 51.5074, lng: -0.1278 })
  })

  it('clears MapView origin when IsochroneForm emits origin-change with null', async () => {
    const wrapper = mountView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', { lat: 51.5074, lng: -0.1278 })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', null)
    expect(wrapper.findComponent({ name: 'MapView' }).props('origin')).toBeNull()
  })
})
