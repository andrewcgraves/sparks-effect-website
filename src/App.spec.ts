import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'

vi.mock('./analytics/index', () => ({
  trackPageView: vi.fn(),
}))

vi.mock('./api/isochrone', () => ({
  fetchIsochrone: vi.fn(),
}))

import { trackPageView } from './analytics/index'
import { fetchIsochrone } from './api/isochrone'
import type { ChainResponse } from './fixtures/isochrone'

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

describe('App', () => {
  beforeEach(() => {
    vi.mocked(trackPageView).mockClear()
    vi.mocked(fetchIsochrone).mockClear()
  })

  it('renders the app title', () => {
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    expect(wrapper.get('h1').text()).toBe('Sparks Effect')
  })

  it('tracks a page view on mount', () => {
    mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    expect(trackPageView).toHaveBeenCalledOnce()
    expect(trackPageView).toHaveBeenCalledWith('/')
  })

  it('passes null isochroneData and loading=false to MapView before any submission', () => {
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    const mapView = wrapper.findComponent({ name: 'MapView' })
    expect(mapView.props('isochroneData')).toBeNull()
    expect(mapView.props('loading')).toBe(false)
  })

  it('calls fetchIsochrone with the form payload on submit', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
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

  it('sets loading=true on MapView while the fetch is in flight', async () => {
    let resolveIsochrone!: (v: ChainResponse) => void
    vi.mocked(fetchIsochrone).mockReturnValue(
      new Promise<ChainResponse>((res) => { resolveIsochrone = res }),
    )
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
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
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
    })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MapView' }).props('isochroneData')).toEqual(stubIsochrone)
    expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
  })

  it('clears loading state and shows an error message when the fetch throws', async () => {
    vi.mocked(fetchIsochrone).mockRejectedValue(new Error('API down'))
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
    })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
    expect(wrapper.find('[data-testid="fetch-error"]').exists()).toBe(true)
  })

  it('passes origin to MapView when IsochroneForm emits origin-change', async () => {
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', { lat: 51.5074, lng: -0.1278 })
    expect(wrapper.findComponent({ name: 'MapView' }).props('origin')).toEqual({ lat: 51.5074, lng: -0.1278 })
  })

  it('clears MapView origin when IsochroneForm emits origin-change with null', async () => {
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', { lat: 51.5074, lng: -0.1278 })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', null)
    expect(wrapper.findComponent({ name: 'MapView' }).props('origin')).toBeNull()
  })
})
