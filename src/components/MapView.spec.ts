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
import type { Route, Station, Service } from '../api/scenarios'

const mockSetData = vi.fn()

const {
  mockAddSource,
  mockAddLayer,
  mockFitBounds,
  mockFlyTo,
  mockOn,
  mockRemove,
  mockResize,
  mockGetSource,
  mockSetLngLat,
  mockMarkerAddTo,
  mockMarkerRemove,
} = vi.hoisted(() => ({
  mockAddSource: vi.fn(),
  mockAddLayer: vi.fn(),
  mockFitBounds: vi.fn(),
  mockFlyTo: vi.fn(),
  mockOn: vi.fn(),
  mockRemove: vi.fn(),
  mockResize: vi.fn(),
  mockGetSource: vi.fn(),
  mockSetLngLat: vi.fn(),
  mockMarkerAddTo: vi.fn(),
  mockMarkerRemove: vi.fn(),
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
    this['flyTo'] = mockFlyTo
    this['on'] = mockOn
    this['remove'] = mockRemove
    this['resize'] = mockResize
    this['getSource'] = mockGetSource
  }),
  Marker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['setLngLat'] = mockSetLngLat
    this['addTo'] = mockMarkerAddTo
    this['remove'] = mockMarkerRemove
  }),
}))

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
  platform_height: '0',
}

const stubService: Service = {
  id: 'svc1',
  name: 'Northbound Express',
  vehicle_type: {
    id: 'vt1',
    name: 'High-Speed Rail',
    propulsion: 'electric',
    max_speed_kmh: 320,
  },
  direction: 'northbound',
  provenance: 'calibrated',
  stop_count: 2,
  frequency_windows: [],
}

const defaultProps = { isochroneData: null, loading: false, routes: [], stations: [], services: [] }

async function triggerMapLoad() {
  const call = mockOn.mock.calls.find((args: unknown[]) => args[0] === 'load')
  const cb = call?.[1]
  if (typeof cb === 'function') await cb()
}

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSource.mockReturnValue(null)
    mockSetLngLat.mockReturnValue({ addTo: mockMarkerAddTo })
  })

  it('does not add isochrone source or layer on load when no isochroneData prop is provided', async () => {
    mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    expect(mockAddSource).not.toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, expect.anything())
    expect(mockAddLayer).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_LAYER_ID }),
    )
  })

  it('adds the isochrone source and layer when isochroneData prop is provided at mount time', async () => {
    mount(MapView, { props: { ...defaultProps, isochroneData: staticIsochroneResponse } })
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
    const wrapper = mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    await wrapper.setProps({ isochroneData: staticIsochroneResponse })
    expect(mockSetData).toHaveBeenCalledWith(staticIsochroneResponse)
  })

  it('fits the map to the isochrone frame when isochroneData arrives after load', async () => {
    const wrapper = mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    mockFitBounds.mockClear()

    await wrapper.setProps({ isochroneData: staticIsochroneResponse })

    expect(mockFitBounds).toHaveBeenCalledWith(
      ISOCHRONE_BOUNDS_CORNERS,
      expect.objectContaining({
        padding: expect.objectContaining({ top: 56, bottom: 112, left: 56, right: 56 }),
      }),
    )
  })

  it('fits the map to the isochrone frame after an origin snap when isochrone is generated', async () => {
    const wrapper = mount(MapView, {
      props: { ...defaultProps, origin: { lat: 34.05, lng: -118.25 } },
    })
    await triggerMapLoad()
    mockFitBounds.mockClear()
    mockFlyTo.mockClear()

    await wrapper.setProps({ isochroneData: staticIsochroneResponse })

    expect(mockFitBounds).toHaveBeenCalledWith(
      ISOCHRONE_BOUNDS_CORNERS,
      expect.objectContaining({
        padding: expect.objectContaining({ top: 56, bottom: 112, left: 56, right: 56 }),
      }),
    )
  })

  it('adds isochrone source via useIsochroneLayer when prop updates and source does not yet exist', async () => {
    mockGetSource.mockReturnValue(null)
    const wrapper = mount(MapView, { props: defaultProps })
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
    mount(MapView, { props: defaultProps })
    expect(mockAddSource).not.toHaveBeenCalled()
    expect(mockAddLayer).not.toHaveBeenCalled()
  })

  it('shows the loading overlay when loading prop is true', () => {
    const wrapper = mount(MapView, { props: { ...defaultProps, loading: true } })
    expect(wrapper.find('[data-testid="map-loading"]').exists()).toBe(true)
  })

  it('hides the loading overlay when loading prop is false', () => {
    const wrapper = mount(MapView, { props: defaultProps })
    expect(wrapper.find('[data-testid="map-loading"]').exists()).toBe(false)
  })

  it('adds route and station layers when routes prop is non-empty at map load time', async () => {
    mount(MapView, { props: { ...defaultProps, routes: [stubRoute], stations: [stubStation] } })
    await triggerMapLoad()
    expect(mockAddSource).toHaveBeenCalledWith(
      ROUTE_SOURCE_ID,
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ROUTE_LINE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID }),
    )
    expect(mockAddSource).toHaveBeenCalledWith(
      STATION_SOURCE_ID,
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: STATION_DOTS_LAYER_ID, type: 'circle', source: STATION_SOURCE_ID }),
    )
  })

  it('does not add route layer when routes prop is empty at map load time', async () => {
    mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    expect(mockAddSource).not.toHaveBeenCalledWith(ROUTE_SOURCE_ID, expect.anything())
    expect(mockAddLayer).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: ROUTE_LINE_LAYER_ID }),
    )
  })

  it('adds route layer when routes prop arrives after map loads', async () => {
    const wrapper = mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    expect(mockAddSource).not.toHaveBeenCalledWith(ROUTE_SOURCE_ID, expect.anything())

    await wrapper.setProps({ routes: [stubRoute], stations: [stubStation] })
    expect(mockAddSource).toHaveBeenCalledWith(
      ROUTE_SOURCE_ID,
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ROUTE_LINE_LAYER_ID }),
    )
  })

  it('does not add route layer a second time when routes prop updates again', async () => {
    const wrapper = mount(MapView, { props: { ...defaultProps, routes: [stubRoute], stations: [stubStation] } })
    await triggerMapLoad()
    const addSourceCallCount = mockAddSource.mock.calls.filter(
      (c: unknown[]) => c[0] === ROUTE_SOURCE_ID,
    ).length
    expect(addSourceCallCount).toBe(1)

    await wrapper.setProps({ routes: [...stubRoute ? [stubRoute] : [], stubRoute] })
    const addSourceCallCountAfter = mockAddSource.mock.calls.filter(
      (c: unknown[]) => c[0] === ROUTE_SOURCE_ID,
    ).length
    expect(addSourceCallCountAfter).toBe(1)
  })

  it('still renders isochrone layer when routes prop is empty', async () => {
    mount(MapView, { props: { ...defaultProps, isochroneData: staticIsochroneResponse } })
    await triggerMapLoad()
    expect(mockAddSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, expect.anything())
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_LAYER_ID }),
    )
  })

  it('removes the map on unmount', () => {
    const wrapper = mount(MapView, { props: defaultProps })
    wrapper.unmount()
    expect(mockRemove).toHaveBeenCalledOnce()
  })

  it('initializes map centered on all isochrone segments', async () => {
    const { Map } = await import('maplibre-gl')
    mount(MapView, { props: defaultProps })
    const options = (Map as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(options.center[0]).toBeCloseTo(ISOCHRONE_CENTER[0], 5)
    expect(options.center[1]).toBeCloseTo(ISOCHRONE_CENTER[1], 5)
  })

  it('initializes map with a keyless OpenFreeMap style by default', async () => {
    const { Map } = await import('maplibre-gl')
    mount(MapView, { props: defaultProps })
    const options = (Map as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(options.style).toBe('https://tiles.openfreemap.org/styles/liberty')
  })

  it('fits bounds to all isochrone segments after load', async () => {
    mount(MapView, { props: defaultProps })
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
    const wrapper = mount(MapView, { props: defaultProps })
    const legend = wrapper.get('[aria-label="Isochrone color key"]')
    expect(legend.text()).toContain('Origin reach')
    expect(legend.text()).toContain('From station')
  })

  it('places an origin marker when the origin prop is provided', () => {
    mount(MapView, { props: { ...defaultProps, origin: { lat: 37.33, lng: -121.89 } } })
    expect(mockSetLngLat).toHaveBeenCalledWith([-121.89, 37.33])
    expect(mockMarkerAddTo).toHaveBeenCalled()
  })

  it('does not place a marker when origin prop is absent', () => {
    mount(MapView, { props: defaultProps })
    expect(mockSetLngLat).not.toHaveBeenCalled()
    expect(mockMarkerAddTo).not.toHaveBeenCalled()
  })

  it('updates the marker when the origin prop changes', async () => {
    const wrapper = mount(MapView, { props: { ...defaultProps, origin: { lat: 37.33, lng: -121.89 } } })
    vi.clearAllMocks()
    mockSetLngLat.mockReturnValue({ addTo: mockMarkerAddTo })

    await wrapper.setProps({ origin: { lat: 38.0, lng: -122.5 } })

    expect(mockSetLngLat).toHaveBeenCalledWith([-122.5, 38.0])
    expect(mockMarkerAddTo).toHaveBeenCalled()
  })

  it('removes the marker when origin prop changes to null', async () => {
    const wrapper = mount(MapView, { props: { ...defaultProps, origin: { lat: 37.33, lng: -121.89 } } })

    await wrapper.setProps({ origin: null })

    expect(mockMarkerRemove).toHaveBeenCalled()
  })

  it('flies the map to the origin when origin is set after map load', async () => {
    const wrapper = mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    mockFlyTo.mockClear()

    await wrapper.setProps({ origin: { lat: 34.05, lng: -118.25 } })

    expect(mockFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-118.25, 34.05],
        zoom: 12 - Math.log2(3),
      }),
    )
  })

  it('flies the map to the origin on load when origin is already set', async () => {
    mount(MapView, { props: { ...defaultProps, origin: { lat: 34.05, lng: -118.25 } } })
    await triggerMapLoad()

    expect(mockFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-118.25, 34.05],
        zoom: 12 - Math.log2(3),
      }),
    )
  })

  it('does not fly when origin is cleared to null', async () => {
    const wrapper = mount(MapView, {
      props: { ...defaultProps, origin: { lat: 37.33, lng: -121.89 } },
    })
    await triggerMapLoad()
    mockFlyTo.mockClear()

    await wrapper.setProps({ origin: null })

    expect(mockFlyTo).not.toHaveBeenCalled()
  })

  it('flies again when origin coordinates change', async () => {
    const wrapper = mount(MapView, {
      props: { ...defaultProps, origin: { lat: 37.33, lng: -121.89 } },
    })
    await triggerMapLoad()
    mockFlyTo.mockClear()

    await wrapper.setProps({ origin: { lat: 38.0, lng: -122.5 } })

    expect(mockFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-122.5, 38.0],
        zoom: 12 - Math.log2(3),
      }),
    )
  })

  it('does not fly to origin before the map load event', () => {
    mount(MapView, { props: { ...defaultProps, origin: { lat: 34.05, lng: -118.25 } } })
    expect(mockFlyTo).not.toHaveBeenCalled()
  })

  it('accepts a services prop', () => {
    const wrapper = mount(MapView, { props: { ...defaultProps, services: [stubService] } })
    expect(wrapper.props('services')).toEqual([stubService])
  })
})
