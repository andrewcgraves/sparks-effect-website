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

const { mockAddSource, mockAddLayer, mockFitBounds, mockOn, mockRemove, mockResize } = vi.hoisted(
  () => ({
    mockAddSource: vi.fn(),
    mockAddLayer: vi.fn(),
    mockFitBounds: vi.fn(),
    mockOn: vi.fn(),
    mockRemove: vi.fn(),
    mockResize: vi.fn(),
  }),
)

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
    vi.mocked(fetchScenarioRoutes).mockResolvedValue([stubRoute])
    vi.mocked(fetchScenarioStations).mockResolvedValue([stubStation])
  })

  it('registers the isochrone GeoJSON source from static fixture when the map loads', async () => {
    mount(MapView)
    await triggerMapLoad()
    expect(mockAddSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: staticIsochroneResponse,
    })
  })

  it('adds a fill layer for isochrone polygons when the map loads', async () => {
    mount(MapView)
    await triggerMapLoad()
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ISOCHRONE_LAYER_ID,
        type: 'fill',
        source: ISOCHRONE_SOURCE_ID,
      }),
    )
  })

  it('does not register source or layer before the load event fires', () => {
    mount(MapView)
    expect(mockAddSource).not.toHaveBeenCalled()
    expect(mockAddLayer).not.toHaveBeenCalled()
  })

  it('adds a line layer for the CA HSR route after map loads', async () => {
    mount(MapView)
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
    mount(MapView)
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
    mount(MapView)
    await triggerMapLoad()
    expect(mockAddSource).not.toHaveBeenCalledWith(ROUTE_SOURCE_ID, expect.anything())
    expect(mockAddLayer).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: ROUTE_LINE_LAYER_ID }),
    )
  })

  it('removes the map on unmount', () => {
    const wrapper = mount(MapView)
    wrapper.unmount()
    expect(mockRemove).toHaveBeenCalledOnce()
  })

  it('initializes map centered on all isochrone segments', async () => {
    const { Map } = await import('maplibre-gl')
    mount(MapView)
    const options = (Map as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(options.center[0]).toBeCloseTo(ISOCHRONE_CENTER[0], 5)
    expect(options.center[1]).toBeCloseTo(ISOCHRONE_CENTER[1], 5)
  })

  it('initializes map with a keyless OpenFreeMap style by default', async () => {
    const { Map } = await import('maplibre-gl')
    mount(MapView)
    const options = (Map as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(options.style).toBe('https://tiles.openfreemap.org/styles/liberty')
  })

  it('fits bounds to all isochrone segments after load', async () => {
    mount(MapView)
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
    const wrapper = mount(MapView)
    const legend = wrapper.get('[aria-label="Isochrone color key"]')
    expect(legend.text()).toContain('Origin reach')
    expect(legend.text()).toContain('From station')
  })
})
