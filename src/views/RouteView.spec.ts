import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import RouteView from './RouteView.vue'
import type { Route } from '../api/authoring'

const mockUseRoute = vi.fn()
vi.mock('../composables/useRoute', () => ({
  useRoute: (slug: string) => mockUseRoute(slug),
}))

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
    mockUseRoute.mockReset()
  })

  it('calls useRoute with the given slug', () => {
    mockUseRoute.mockReturnValue({ route: ref(null), loading: ref(true), notFound: ref(false) })
    mountRouteView('main-line')
    expect(mockUseRoute).toHaveBeenCalledWith('main-line')
  })

  it('shows a loading state while the route is loading', () => {
    mockUseRoute.mockReturnValue({ route: ref(null), loading: ref(true), notFound: ref(false) })
    const wrapper = mountRouteView()
    expect(wrapper.text()).toContain('Loading')
    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(false)
  })

  it('shows a not-found state for an unknown slug', () => {
    mockUseRoute.mockReturnValue({ route: ref(null), loading: ref(false), notFound: ref(true) })
    const wrapper = mountRouteView('no-such-route')
    expect(wrapper.text()).toContain('not found')
    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(false)
  })

  it('titles the page with the route name once loaded', () => {
    mockUseRoute.mockReturnValue({ route: ref(stubRoute), loading: ref(false), notFound: ref(false) })
    const wrapper = mountRouteView()
    expect(wrapper.get('h1').text()).toBe('Main Line')
  })

  it('renders the route geometry via MapView once loaded', () => {
    mockUseRoute.mockReturnValue({ route: ref(stubRoute), loading: ref(false), notFound: ref(false) })
    const wrapper = mountRouteView()
    const mapView = wrapper.findComponent({ name: 'MapView' })
    expect(mapView.exists()).toBe(true)
    const routes = mapView.props('routes') as Array<{ id: string; geometry: unknown }>
    expect(routes).toHaveLength(1)
    expect(routes[0].id).toBe('rt1')
    expect(routes[0].geometry).toEqual(stubRoute.geometry)
  })

  it('renders a physics summary row per segment', () => {
    mockUseRoute.mockReturnValue({ route: ref(stubRoute), loading: ref(false), notFound: ref(false) })
    const wrapper = mountRouteView()
    const rows = wrapper.findAll('[data-testid="route-segment-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('150')
    expect(rows[0].text()).toContain('1200')
    expect(rows[0].text()).toContain('1.2')
  })

  it('shows tangent track for a zero curve radius', () => {
    mockUseRoute.mockReturnValue({ route: ref(stubRoute), loading: ref(false), notFound: ref(false) })
    const wrapper = mountRouteView()
    const rows = wrapper.findAll('[data-testid="route-segment-row"]')
    expect(rows[1].text()).toContain('Tangent')
  })
})
