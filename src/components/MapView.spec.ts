import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MapView from './MapView.vue'
import { ISOCHRONE_SOURCE_ID, ISOCHRONE_LAYER_ID } from '../composables/useIsochroneLayer'
import {
  staticIsochroneResponse,
  ISOCHRONE_BOUNDS,
  ISOCHRONE_BOUNDS_CORNERS,
  ISOCHRONE_CENTER,
} from '../fixtures/isochrone'

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

function triggerMapLoad() {
  const call = mockOn.mock.calls.find((args: unknown[]) => args[0] === 'load')
  const cb = call?.[1]
  if (typeof cb === 'function') cb()
}

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers the isochrone GeoJSON source when the map loads', () => {
    mount(MapView)
    triggerMapLoad()
    expect(mockAddSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: staticIsochroneResponse,
    })
  })

  it('adds a fill layer for isochrone polygons when the map loads', () => {
    mount(MapView)
    triggerMapLoad()
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

  it('fits bounds to all isochrone segments after load', () => {
    mount(MapView)
    triggerMapLoad()
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
