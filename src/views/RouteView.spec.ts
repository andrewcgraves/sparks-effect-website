import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { Route } from '../api/authoring'

vi.mock('../api/authoring/routes', () => ({
  fetchRoute: vi.fn(),
}))
import { fetchRoute } from '../api/authoring/routes'
import { ApiError } from '../api/authoring/client'

import RouteView from './RouteView.vue'

const stubRoute: Route = {
  id: 'rt1',
  slug: 'main-line',
  name: 'Main Line',
  mode: 'rail',
  bidirectional: true,
  geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
  segments: [
    { cant_mm: 150, curve_radius_m: 1200, grade_pct: 1.2 },
    { cant_mm: 0, curve_radius_m: 0, grade_pct: -0.5 },
  ],
}

function mountRouteView(slug = 'main-line') {
  return mount(RouteView, {
    props: { slug },
    global: { stubs: { MapView: true } },
  })
}

describe('RouteView', () => {
  beforeEach(() => {
    vi.mocked(fetchRoute).mockReset()
  })

  it('calls fetchRoute with the given slug', () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    mountRouteView('main-line')
    expect(fetchRoute).toHaveBeenCalledWith('main-line')
  })

  it('shows a loading state while the route is loading', () => {
    vi.mocked(fetchRoute).mockReturnValueOnce(new Promise(() => {}))
    const wrapper = mountRouteView()
    expect(wrapper.text()).toContain('Loading')
    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(false)
  })

  it('shows a not-found state for an unknown slug', async () => {
    vi.mocked(fetchRoute).mockRejectedValueOnce(new ApiError('not found', 404))
    const wrapper = mountRouteView('no-such-route')
    await flushPromises()
    expect(wrapper.text()).toContain('not found')
    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(false)
  })

  it('shows a generic error state when the fetch fails for a reason other than 404', async () => {
    vi.mocked(fetchRoute).mockRejectedValueOnce(new ApiError('server error', 500))
    const wrapper = mountRouteView()
    await flushPromises()
    expect(wrapper.text()).toContain('Something went wrong')
    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(false)
  })

  it('shows a generic error state on a network failure', async () => {
    vi.mocked(fetchRoute).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const wrapper = mountRouteView()
    await flushPromises()
    expect(wrapper.text()).toContain('Something went wrong')
    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(false)
  })

  it('titles the page with the route name once loaded', async () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    const wrapper = mountRouteView()
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Main Line')
  })

  it('renders the route geometry via MapView once loaded', async () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    const wrapper = mountRouteView()
    await flushPromises()
    const mapView = wrapper.findComponent({ name: 'MapView' })
    expect(mapView.exists()).toBe(true)
    const routes = mapView.props('routes') as Array<{ id: string; geometry: unknown }>
    expect(routes).toHaveLength(1)
    expect(routes[0].id).toBe('rt1')
    expect(routes[0].geometry).toEqual(stubRoute.geometry)
    expect(mapView.props('hideIsochroneLegend')).toBe(true)
  })

  it('renders a physics summary row per segment', async () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    const wrapper = mountRouteView()
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="route-segment-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('150')
    expect(rows[0].text()).toContain('1200')
    expect(rows[0].text()).toContain('1.2')
  })

  it('shows tangent track for a zero curve radius', async () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    const wrapper = mountRouteView()
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="route-segment-row"]')
    expect(rows[1].text()).toContain('Tangent')
  })
})
