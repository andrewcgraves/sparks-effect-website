import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MapView from './MapView.vue'
import { ISOCHRONE_SOURCE_ID, ISOCHRONE_LAYER_ID } from '../composables/useIsochroneLayer'
import {
  ROUTE_LINE_LAYER_ID,
  ROUTE_SOURCE_ID,
  STATION_DOTS_LAYER_ID,
  STATION_SOURCE_ID,
} from '../composables/useRouteLayer'
import {
  staticIsochroneResponse,
  ISOCHRONE_BOUNDS,
  ISOCHRONE_BOUNDS_CORNERS,
  ISOCHRONE_CENTER,
} from '../fixtures/isochrone'
import type { Route, Station } from '../api/scenarios'

const mockSetData = vi.fn()

const { mockAddSource, mockAddLayer, mockFitBounds, mockOn, mockRemove, mockResize, mockGetSource } =
  vi.hoisted(() => ({
    mockAddSource: vi.fn(),
    mockAddLayer: vi.fn(),
    mockFitBounds: vi.fn(),
    mockOn: vi.fn(),
    mockRemove: vi.fn(),
    mockResize: vi.fn(),
    mockGetSource: vi.fn(),
  }))

class ResizeObserverStub {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub)

vi.mock('maplibre-gl', () => ({
  Map: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['addSource'] = mockAddSource
    this['addLayer'] = mockAddLayer
    this['fitBounds'] = mockFitBounds
    this['on'] = mockOn
    this['remove'] = mockRemove
    this['resize'] = mockResize
    this['getSource'] = mockGetSource
  }),
}))

vi.mock('../api/scenarios', () => ({
  fetchScenarioRoutes: vi.fn(),
  fetchScenarioStations: vi.fn(),
}))

import { fetchScenarioRoutes, fetchScenarioStations } from '../api/scenarios'

const stubRoute: Route = {
  id: 'r1',
  scenario_id: 's1',
  name: 'Main Line',
  mode: 'hsr',
  geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
  bidirectional: true,
}

const stubStation: Station = {
  id: 'st1',
  scenario_id: 's1',
  slug: 'sf',
  name: 'San Francisco',
  location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
  platform_height: 0,
}

async function triggerMapLoad() {
  const call = mockOn.mock.calls.find((args: unknown[]) => args[0] === 'load')
  const cb = call?.[1]
  if (typeof cb === 'function') await cb()
}

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSource.mockReturnValue(null)
    vi.mocked(fetchScenarioRoutes).mockResolvedValue([stubRoute])
    vi.mocked(fetchScenarioStations).mockResolvedValue([stubStation])
  })

  it('does not add isochrone source or layer on load when no isochroneData prop is provided', async () => {
    mount(MapView, { props: { isochroneData: null, loading: false } })
    await triggerMapLoad()
    expect(mockAddSource).not.toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, expect.anything())
    expect(mockAddLayer).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_LAYER_ID }),
    )
  })

  it('adds the isochrone source and layer when isochroneData prop is provided at mount time', async () => {
    mount(MapView, { props: { isochroneData: staticIsochroneResponse, loading: false } })
    await triggerMapLoad()
    expect(mockAddSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: staticIsochroneResponse,
    })
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_LAYER_ID, type: 'fill', source: ISOCHRONE_SOURCE_ID }),
    )
  })

  it('calls setData on the existing source when isochroneData prop updates after map loads', async () => {
    mockGetSource.mockReturnValue({ setData: mockSetData })
    const wrapper = mount(MapView, { props: { isochroneData: null, loading: false } })
    await triggerMapLoad()
    await wrapper.setProps({ isochroneData: staticIsochroneResponse })
    expect(mockSetData).toHaveBeenCalledWith(staticIsochroneResponse)
  })

  it('adds isochrone source via useIsochroneLayer when prop updates and source does not yet exist', async () => {
    mockGetSource.mockReturnValue(null)
    const wrapper = mount(MapView, { props: { isochroneData: null, loading: false } })
    await triggerMapLoad()
    await wrapper.setProps({ isochroneData: staticIsochroneResponse })
    expect(mockAddSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: staticIsochroneResponse,
    })
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_LAYER_ID }),
    )
  })

  it('does not register source or layer before the load event fires', () => {
    mount(MapView, { props: { isochroneData: null, loading: false } })
    expect(mockAddSource).not.toHaveBeenCalled()
    expect(mockAddLayer).not.toHaveBeenCalled()
  })

  it('shows the loading overlay when loading prop is true', () => {
    const wrapper = mount(MapView, { props: { isochroneData: null, loading: true } })
    expect(wrapper.find('[data-testid="map-loading"]').exists()).toBe(true)
  })

  it('hides the loading overlay when loading prop is false', () => {
    const wrapper = mount(MapView, { props: { isochroneData: null, loading: false } })
    expect(wrapper.find('[data-testid="map-loading"]').exists()).toBe(false)
  })

  it('adds a line layer for the CA HSR route after map loads', async () => {
    mount(MapView, { props: { isochroneData: null, loading: false } })
    await triggerMapLoad()
    expect(fetchScenarioRoutes).toHaveBeenCalledWith('ca-hsr')
    expect(mockAddSource).toHaveBeenCalledWith(
      ROUTE_SOURCE_ID,
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ROUTE_LINE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID }),
    )
  })

  it('adds a circle layer for stations after map loads', async () => {
    mount(MapView, { props: { isochroneData: null, loading: false } })
    await triggerMapLoad()
    expect(fetchScenarioStations).toHaveBeenCalledWith('ca-hsr')
    expect(mockAddSource).toHaveBeenCalledWith(
      STATION_SOURCE_ID,
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: STATION_DOTS_LAYER_ID, type: 'circle', source: STATION_SOURCE_ID }),
    )
  })

  it('does not add route layer when route/station fetch fails', async () => {
    vi.mocked(fetchScenarioRoutes).mockRejectedValueOnce(new Error('unavailable'))
    mount(MapView, { props: { isochroneData: null, loading: false } })
    await triggerMapLoad()
    expect(mockAddSource).not.toHaveBeenCalledWith(ROUTE_SOURCE_ID, expect.anything())
    expect(mockAddLayer).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: ROUTE_LINE_LAYER_ID }),
    )
  })

  it('still renders isochrone layer (from prop) when route/station fetch fails', async () => {
    vi.mocked(fetchScenarioRoutes).mockRejectedValueOnce(new Error('unavailable'))
    mount(MapView, { props: { isochroneData: staticIsochroneResponse, loading: false } })
    await triggerMapLoad()
    expect(mockAddSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, expect.anything())
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_LAYER_ID }),
    )
  })

  it('removes the map on unmount', () => {
    const wrapper = mount(MapView, { props: { isochroneData: null, loading: false } })
    wrapper.unmount()
    expect(mockRemove).toHaveBeenCalledOnce()
  })

  it('initializes map centered on all isochrone segments', async () => {
    const { Map } = await import('maplibre-gl')
    mount(MapView, { props: { isochroneData: null, loading: false } })
    const options = (Map as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(options.center[0]).toBeCloseTo(ISOCHRONE_CENTER[0], 5)
    expect(options.center[1]).toBeCloseTo(ISOCHRONE_CENTER[1], 5)
  })

  it('initializes map with a keyless OpenFreeMap style by default', async () => {
    const { Map } = await import('maplibre-gl')
    mount(MapView, { props: { isochroneData: null, loading: false } })
    const options = (Map as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(options.style).toBe('https://tiles.openfreemap.org/styles/liberty')
  })

  it('fits bounds to all isochrone segments after load', async () => {
    mount(MapView, { props: { isochroneData: null, loading: false } })
    await triggerMapLoad()
    expect(mockResize).toHaveBeenCalled()
    expect(mockFitBounds).toHaveBeenCalledWith(
      ISOCHRONE_BOUNDS_CORNERS,
      expect.objectContaining({
        duration: 0,
        maxZoom: 11,
        padding: expect.objectContaining({ top: 56, bottom: 112, left: 56, right: 56 }),
      }),
    )
  })

  it('ISOCHRONE_BOUNDS covers the sample CA HSR corridor', () => {
    const [minLng, minLat, maxLng, maxLat] = ISOCHRONE_BOUNDS
    expect(minLat).toBeGreaterThan(36.5)
    expect(maxLat).toBeLessThan(38.5)
    expect(minLng).toBeGreaterThan(-123)
    expect(maxLng).toBeLessThan(-121)
  })

  it('ISOCHRONE_CENTER is the midpoint of ISOCHRONE_BOUNDS', () => {
    expect(ISOCHRONE_CENTER[0]).toBeCloseTo((ISOCHRONE_BOUNDS[0] + ISOCHRONE_BOUNDS[2]) / 2, 10)
    expect(ISOCHRONE_CENTER[1]).toBeCloseTo((ISOCHRONE_BOUNDS[1] + ISOCHRONE_BOUNDS[3]) / 2, 10)
  })

  it('renders a color key for origin and egress isochrones', () => {
    const wrapper = mount(MapView, { props: { isochroneData: null, loading: false } })
    const legend = wrapper.get('[aria-label="Isochrone color key"]')
    expect(legend.text()).toContain('Origin reach')
    expect(legend.text()).toContain('From station')
  })
})
