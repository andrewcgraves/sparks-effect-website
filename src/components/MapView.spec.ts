import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { FullscreenControl } from 'maplibre-gl'
import MapView from './MapView.vue'
import { ISOCHRONE_SOURCE_ID, ISOCHRONE_LAYER_ID } from '../composables/useIsochroneLayer'
import {
  ROUTE_LINE_LAYER_ID,
  ROUTE_SOURCE_ID,
  STATION_DOTS_LAYER_ID,
  STATION_SOURCE_ID,
  routeBoundsCorners,
} from '../composables/useRouteLayer'
import {
  RAW_STOP_LAYER_ID,
  RAW_STOP_SOURCE_ID,
  SNAPPED_STOP_SOURCE_ID,
  LEADER_SOURCE_ID,
} from '../composables/useStopPreviewLayer'
import type { StopPreviewPair } from '../composables/useStopPreviewLayer'
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
  mockAddControl,
  mockCanvas,
  mockGetCanvas,
  mockDoubleClickZoomEnable,
  mockDoubleClickZoomDisable,
  mockOnce,
  mockOff,
  mockGetLayer,
  mockQueryRenderedFeatures,
} = vi.hoisted(() => {
  const canvas = { style: { cursor: '' } }
  return {
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
    mockAddControl: vi.fn(),
    mockCanvas: canvas,
    mockGetCanvas: vi.fn(() => canvas),
    mockDoubleClickZoomEnable: vi.fn(),
    mockDoubleClickZoomDisable: vi.fn(),
    mockOnce: vi.fn(),
    mockOff: vi.fn(),
    mockGetLayer: vi.fn(),
    mockQueryRenderedFeatures: vi.fn(),
  }
})

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
    this['addControl'] = mockAddControl
    this['getCanvas'] = mockGetCanvas
    this['once'] = mockOnce
    this['off'] = mockOff
    this['getLayer'] = mockGetLayer
    this['queryRenderedFeatures'] = mockQueryRenderedFeatures
    this['doubleClickZoom'] = {
      enable: mockDoubleClickZoomEnable,
      disable: mockDoubleClickZoomDisable,
    }
  }),
  Marker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['setLngLat'] = mockSetLngLat
    this['addTo'] = mockMarkerAddTo
    this['remove'] = mockMarkerRemove
  }),
  FullscreenControl: vi.fn(),
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

const stubRouteCorners = routeBoundsCorners([stubRoute]) as [[number, number], [number, number]]

async function triggerMapLoad() {
  const call = mockOn.mock.calls.find((args: unknown[]) => args[0] === 'load')
  const cb = call?.[1]
  if (typeof cb === 'function') await cb()
}

// Fires a map-level (unscoped) MapLibre event registered through map.on().
function fireMapEvent(type: string, event: unknown) {
  const call = mockOn.mock.calls.find(
    (args: unknown[]) => args[0] === type && typeof args[1] === 'function',
  )
  const cb = call?.[1] as ((e: unknown) => void) | undefined
  cb?.(event)
}

// Fires a layer-scoped MapLibre event, i.e. one registered as
// map.on(type, layerId, handler).
function fireLayerEvent(type: string, layer: string, event: unknown) {
  const call = mockOn.mock.calls.find((args: unknown[]) => args[0] === type && args[1] === layer)
  const cb = call?.[2] as ((e: unknown) => void) | undefined
  cb?.(event)
}

function clickEventAt(lat: number, lng: number) {
  return { lngLat: { lat, lng }, point: { x: 10, y: 10 } }
}

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSource.mockReturnValue(null)
    mockSetLngLat.mockReturnValue({ addTo: mockMarkerAddTo })
    mockGetCanvas.mockReturnValue(mockCanvas)
    mockCanvas.style.cursor = ''
    mockGetLayer.mockReturnValue(undefined)
    mockQueryRenderedFeatures.mockReturnValue([])
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

  it('adds the isochrone source when the first plot arrives after the map has loaded', async () => {
    const wrapper = mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    await wrapper.setProps({ isochroneData: staticIsochroneResponse })
    expect(mockAddSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: staticIsochroneResponse,
    })
  })

  // Rewriting the one source is what keeps the fill from flashing between
  // plots, so a second plot must not re-add it.
  it('rewrites the existing source when a second plot arrives, without re-adding it', async () => {
    mockGetSource.mockReturnValue({ setData: mockSetData })
    const wrapper = mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    await wrapper.setProps({ isochroneData: staticIsochroneResponse })

    const secondPlot = { ...staticIsochroneResponse, features: [] }
    await wrapper.setProps({ isochroneData: secondPlot })

    expect(mockSetData).toHaveBeenCalledWith(secondPlot)
    const isochroneAdds = mockAddSource.mock.calls.filter(
      (args: unknown[]) => args[0] === ISOCHRONE_SOURCE_ID,
    )
    expect(isochroneAdds).toHaveLength(1)
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
    expect(options.style).toBe('https://tiles.openfreemap.org/styles/positron')
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

  it('initializes map centered on the route bounds when routes are provided at mount time', async () => {
    const { Map } = await import('maplibre-gl')
    mount(MapView, { props: { ...defaultProps, routes: [stubRoute] } })
    const options = (Map as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(options.center[0]).toBeCloseTo(-122.15, 5)
    expect(options.center[1]).toBeCloseTo(37.5, 5)
  })

  it('fits bounds to the route geometry after load when routes are provided', async () => {
    mount(MapView, { props: { ...defaultProps, routes: [stubRoute] } })
    await triggerMapLoad()
    expect(mockFitBounds).toHaveBeenCalledWith(
      stubRouteCorners,
      expect.objectContaining({
        duration: 0,
        maxZoom: 11,
        padding: expect.objectContaining({ top: 56, bottom: 112, left: 56, right: 56 }),
      }),
    )
  })

  it('refits the map to route bounds when routes arrive after load', async () => {
    const wrapper = mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    mockFitBounds.mockClear()

    await wrapper.setProps({ routes: [stubRoute] })

    expect(mockFitBounds).toHaveBeenCalledWith(
      stubRouteCorners,
      expect.objectContaining({
        padding: expect.objectContaining({ top: 56, bottom: 112, left: 56, right: 56 }),
      }),
    )
  })

  it('does not refit the map when routes change again after the initial route fit', async () => {
    const wrapper = mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    await wrapper.setProps({ routes: [stubRoute] })
    mockFitBounds.mockClear()

    const otherRoute: Route = {
      ...stubRoute,
      id: 'r2',
      geometry: { type: 'LineString', coordinates: [[-118.25, 34.05], [-117.9, 33.8]] },
    }
    await wrapper.setProps({ routes: [stubRoute, otherRoute] })

    expect(mockFitBounds).not.toHaveBeenCalled()
  })

  it('prefers the isochrone frame over route bounds when isochroneData is also provided', async () => {
    mount(MapView, {
      props: { ...defaultProps, routes: [stubRoute], isochroneData: staticIsochroneResponse },
    })
    await triggerMapLoad()
    expect(mockFitBounds).toHaveBeenCalledWith(
      ISOCHRONE_BOUNDS_CORNERS,
      expect.objectContaining({
        padding: expect.objectContaining({ top: 56, bottom: 112, left: 56, right: 56 }),
      }),
    )
    expect(mockFitBounds).not.toHaveBeenCalledWith(
      stubRouteCorners,
      expect.anything(),
    )
  })

  it('prefers snapping to origin over route bounds when origin is also provided', async () => {
    mount(MapView, {
      props: { ...defaultProps, routes: [stubRoute], origin: { lat: 34.05, lng: -118.25 } },
    })
    await triggerMapLoad()
    expect(mockFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-118.25, 34.05], zoom: 9 }),
    )
    expect(mockFitBounds).not.toHaveBeenCalled()
  })

  it('falls back to the static isochrone bounds fit when no routes are provided', async () => {
    mount(MapView, { props: defaultProps })
    await triggerMapLoad()
    expect(mockFitBounds).toHaveBeenCalledWith(
      ISOCHRONE_BOUNDS_CORNERS,
      expect.objectContaining({ duration: 0, maxZoom: 11 }),
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

  it('hides the isochrone legend when hideIsochroneLegend is set', () => {
    const wrapper = mount(MapView, { props: { ...defaultProps, hideIsochroneLegend: true } })
    expect(wrapper.find('[aria-label="Isochrone color key"]').exists()).toBe(false)
  })

  it('adds a fullscreen control so the map can be expanded', () => {
    mount(MapView, { props: defaultProps })
    expect(FullscreenControl).toHaveBeenCalledOnce()
    expect(mockAddControl).toHaveBeenCalledWith(expect.any(FullscreenControl))
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
        zoom: 9,
      }),
    )
  })

  it('flies the map to the origin on load when origin is already set', async () => {
    mount(MapView, { props: { ...defaultProps, origin: { lat: 34.05, lng: -118.25 } } })
    await triggerMapLoad()

    expect(mockFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-118.25, 34.05],
        zoom: 9,
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
        zoom: 9,
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

  describe('stopPreviewPairs', () => {
    const stubPairs: StopPreviewPair[] = [
      { id: 'a', raw: { lat: 37.77, lng: -122.41 }, snapped: { lat: 37.771, lng: -122.409 }, offRoute: false },
    ]

    it('does not add stop-preview sources when the prop is absent', async () => {
      mount(MapView, { props: defaultProps })
      await triggerMapLoad()
      expect(mockAddSource).not.toHaveBeenCalledWith(RAW_STOP_SOURCE_ID, expect.anything())
    })

    it('adds stop-preview sources and renders the initial pairs when provided at load', async () => {
      mockGetSource.mockReturnValue({ setData: mockSetData })
      mount(MapView, { props: { ...defaultProps, stopPreviewPairs: stubPairs } })
      await triggerMapLoad()

      expect(mockAddSource).toHaveBeenCalledWith(RAW_STOP_SOURCE_ID, expect.objectContaining({ type: 'geojson' }))
      expect(mockAddSource).toHaveBeenCalledWith(SNAPPED_STOP_SOURCE_ID, expect.objectContaining({ type: 'geojson' }))
      expect(mockAddSource).toHaveBeenCalledWith(LEADER_SOURCE_ID, expect.objectContaining({ type: 'geojson' }))
      expect(mockSetData).toHaveBeenCalled()
    })

    it('updates the stop-preview layer when the prop changes after load', async () => {
      mockGetSource.mockReturnValue({ setData: mockSetData })
      const wrapper = mount(MapView, { props: { ...defaultProps, stopPreviewPairs: stubPairs } })
      await triggerMapLoad()
      mockSetData.mockClear()

      const nextPairs: StopPreviewPair[] = [
        ...stubPairs,
        { id: 'b', raw: { lat: 38, lng: -123 }, snapped: null },
      ]
      await wrapper.setProps({ stopPreviewPairs: nextPairs })

      expect(mockSetData).toHaveBeenCalled()
      const rawCall = mockSetData.mock.calls.find((_, i) => i === 0)
      expect(rawCall).toBeDefined()
    })
  })

  describe('placement arming', () => {
    it('emits map-click with the clicked coordinates while armed', async () => {
      const wrapper = mount(MapView, { props: { ...defaultProps, placementArmed: true } })
      await triggerMapLoad()

      fireMapEvent('click', clickEventAt(37.77, -122.41))

      expect(wrapper.emitted('map-click')).toEqual([[{ lat: 37.77, lng: -122.41 }]])
    })

    it('keeps emitting across consecutive clicks, so arming is sticky', async () => {
      const wrapper = mount(MapView, { props: { ...defaultProps, placementArmed: true } })
      await triggerMapLoad()

      fireMapEvent('click', clickEventAt(37.77, -122.41))
      fireMapEvent('click', clickEventAt(37.33, -121.88))

      expect(wrapper.emitted('map-click')).toHaveLength(2)
    })

    it('does not emit map-click when the map is not armed', async () => {
      const wrapper = mount(MapView, { props: defaultProps })
      await triggerMapLoad()

      fireMapEvent('click', clickEventAt(37.77, -122.41))

      expect(wrapper.emitted('map-click')).toBeUndefined()
    })

    it('shows a crosshair cursor and disables double-click zoom while armed', async () => {
      mount(MapView, { props: { ...defaultProps, placementArmed: true } })
      await triggerMapLoad()

      expect(mockCanvas.style.cursor).toBe('crosshair')
      expect(mockDoubleClickZoomDisable).toHaveBeenCalled()
    })

    it('restores the cursor and re-enables double-click zoom when disarmed', async () => {
      const wrapper = mount(MapView, { props: { ...defaultProps, placementArmed: true } })
      await triggerMapLoad()

      await wrapper.setProps({ placementArmed: false })

      expect(mockCanvas.style.cursor).toBe('')
      expect(mockDoubleClickZoomEnable).toHaveBeenCalled()
    })

    it('leaves the cursor and double-click zoom alone when never armed', async () => {
      mount(MapView, { props: defaultProps })
      await triggerMapLoad()

      expect(mockCanvas.style.cursor).toBe('')
      expect(mockDoubleClickZoomDisable).not.toHaveBeenCalled()
    })

    it('renders a persistent on-map cue while armed', async () => {
      const wrapper = mount(MapView, { props: { ...defaultProps, placementArmed: true, placementCue: 'Click the map to add a stop — Esc when done' } })
      await triggerMapLoad()

      expect(wrapper.get('[data-testid="map-placement-cue"]').text()).toBe('Click the map to add a stop — Esc when done')

      await wrapper.setProps({ placementArmed: false })
      expect(wrapper.find('[data-testid="map-placement-cue"]').exists()).toBe(false)
    })

    it('renders whatever cue the caller passes, so each armed mode can say its own thing', async () => {
      const wrapper = mount(MapView, { props: { ...defaultProps, placementArmed: true, placementCue: 'Click the map to set origin — Esc to cancel' } })
      await triggerMapLoad()

      expect(wrapper.get('[data-testid="map-placement-cue"]').text()).toBe('Click the map to set origin — Esc to cancel')
    })

    it('hides the isochrone legend while armed, since the cue takes the same corner', async () => {
      const wrapper = mount(MapView, { props: { ...defaultProps, placementArmed: true, placementCue: 'Click the map to set origin — Esc to cancel' } })
      await triggerMapLoad()

      expect(wrapper.find('[aria-label="Isochrone color key"]').exists()).toBe(false)

      await wrapper.setProps({ placementArmed: false })
      expect(wrapper.find('[aria-label="Isochrone color key"]').exists()).toBe(true)
    })

    it('does not place a stop when an armed click lands on an existing pin', async () => {
      mockGetSource.mockReturnValue({ setData: mockSetData })
      mockGetLayer.mockReturnValue({ id: RAW_STOP_LAYER_ID })
      mockQueryRenderedFeatures.mockReturnValue([{ properties: { id: '0' } }])
      const wrapper = mount(MapView, {
        props: {
          ...defaultProps,
          placementArmed: true,
          stopPreviewPairs: [{ id: '0', raw: { lat: 37.77, lng: -122.41 }, snapped: null }],
        },
      })
      await triggerMapLoad()

      fireMapEvent('click', clickEventAt(37.77, -122.41))

      expect(wrapper.emitted('map-click')).toBeUndefined()
    })

    it('does not fly when the origin coming back is the point just clicked', async () => {
      const wrapper = mount(MapView, { props: { ...defaultProps, placementArmed: true, placementCue: 'cue' } })
      await triggerMapLoad()
      mockFlyTo.mockClear()

      fireMapEvent('click', clickEventAt(37.77, -122.41))
      await wrapper.setProps({ origin: { lat: 37.77, lng: -122.41 }, placementArmed: false })

      expect(mockFlyTo).not.toHaveBeenCalled()
    })

    it('still flies when an origin arrives from somewhere other than the last click', async () => {
      const wrapper = mount(MapView, { props: { ...defaultProps, placementArmed: true, placementCue: 'cue' } })
      await triggerMapLoad()
      fireMapEvent('click', clickEventAt(37.77, -122.41))
      await wrapper.setProps({ origin: { lat: 37.77, lng: -122.41 }, placementArmed: false })
      mockFlyTo.mockClear()

      await wrapper.setProps({ origin: { lat: 34.05, lng: -118.25 } })

      expect(mockFlyTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [-118.25, 34.05], zoom: 9 }),
      )
    })

    it('does not re-fit or fly the map when a stop is placed', async () => {
      mount(MapView, { props: { ...defaultProps, placementArmed: true } })
      await triggerMapLoad()
      mockFitBounds.mockClear()
      mockFlyTo.mockClear()

      fireMapEvent('click', clickEventAt(37.77, -122.41))

      expect(mockFitBounds).not.toHaveBeenCalled()
      expect(mockFlyTo).not.toHaveBeenCalled()
    })
  })

  describe('dragging stop pins', () => {
    const stubPairs: StopPreviewPair[] = [
      { id: '0', raw: { lat: 37.77, lng: -122.41 }, snapped: null },
    ]

    async function mountWithPins(extraProps: Record<string, unknown> = {}) {
      mockGetSource.mockReturnValue({ setData: mockSetData })
      const wrapper = mount(MapView, {
        props: { ...defaultProps, stopPreviewPairs: stubPairs, ...extraProps },
      })
      await triggerMapLoad()
      return wrapper
    }

    function pressPin(id: string, lat: number, lng: number) {
      fireLayerEvent('mousedown', RAW_STOP_LAYER_ID, {
        features: [{ properties: { id } }],
        lngLat: { lat, lng },
        preventDefault: vi.fn(),
      })
    }

    function releaseAt(lat: number, lng: number) {
      const call = mockOnce.mock.calls.find((args: unknown[]) => args[0] === 'mouseup')
      const cb = call?.[1] as ((e: unknown) => void) | undefined
      cb?.({ lngLat: { lat, lng } })
    }

    it('does not wire dragging when no stop pins are drawn', async () => {
      mount(MapView, { props: defaultProps })
      await triggerMapLoad()

      expect(mockOn.mock.calls.some((args: unknown[]) => args[1] === RAW_STOP_LAYER_ID)).toBe(false)
    })

    it('emits stop-drag while a pin is being dragged', async () => {
      const wrapper = await mountWithPins()

      pressPin('0', 37.77, -122.41)
      fireMapEvent('mousemove', { lngLat: { lat: 37.8, lng: -122.4 } })

      expect(wrapper.emitted('stop-drag')).toEqual([['0', { lat: 37.8, lng: -122.4 }]])
    })

    it('emits stop-drag-end once when the pin is dropped', async () => {
      const wrapper = await mountWithPins()

      pressPin('0', 37.77, -122.41)
      fireMapEvent('mousemove', { lngLat: { lat: 37.8, lng: -122.4 } })
      releaseAt(37.85, -122.35)

      expect(wrapper.emitted('stop-drag-end')).toEqual([['0', { lat: 37.85, lng: -122.35 }]])
    })

    it('drags with click-to-place armed, and returns the cursor to the crosshair', async () => {
      const wrapper = await mountWithPins({ placementArmed: true })

      pressPin('0', 37.77, -122.41)
      expect(mockCanvas.style.cursor).toBe('grabbing')

      fireMapEvent('mousemove', { lngLat: { lat: 37.8, lng: -122.4 } })
      releaseAt(37.85, -122.35)

      expect(wrapper.emitted('stop-drag-end')).toHaveLength(1)
      expect(mockCanvas.style.cursor).toBe('crosshair')
    })
  })
})
