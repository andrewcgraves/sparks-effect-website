import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MapView from './MapView.vue'
import { ISOCHRONE_SOURCE_ID, ISOCHRONE_LAYER_ID } from '../composables/useIsochroneLayer'
import { staticIsochroneResponse, ISOCHRONE_BOUNDS } from '../fixtures/isochrone'

const { mockAddSource, mockAddLayer, mockFitBounds, mockOn, mockRemove } = vi.hoisted(() => ({
  mockAddSource: vi.fn(),
  mockAddLayer: vi.fn(),
  mockFitBounds: vi.fn(),
  mockOn: vi.fn(),
  mockRemove: vi.fn(),
}))

vi.mock('maplibre-gl', () => ({
  Map: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['addSource'] = mockAddSource
    this['addLayer'] = mockAddLayer
    this['fitBounds'] = mockFitBounds
    this['on'] = mockOn
    this['remove'] = mockRemove
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

  it('initializes map with a CA Bay Area center', async () => {
    const { Map } = await import('maplibre-gl')
    mount(MapView)
    const options = (Map as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(options.center[0]).toBeCloseTo(-122.39, 1)
    expect(options.center[1]).toBeCloseTo(37.70, 1)
  })

  it('initializes map with a keyless OpenFreeMap style by default', async () => {
    const { Map } = await import('maplibre-gl')
    mount(MapView)
    const options = (Map as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(options.style).toBe('https://tiles.openfreemap.org/styles/liberty')
  })


  it('fits bounds to fixture isochrones after load', () => {
    mount(MapView)
    triggerMapLoad()
    expect(mockFitBounds).toHaveBeenCalledWith(ISOCHRONE_BOUNDS, expect.objectContaining({ padding: 40 }))
  })

  it('ISOCHRONE_BOUNDS covers CA Bay Area latitude range', () => {
    const [minLng, minLat, maxLng, maxLat] = ISOCHRONE_BOUNDS
    expect(minLat).toBeGreaterThan(37)
    expect(maxLat).toBeLessThan(38.5)
    expect(minLng).toBeGreaterThan(-123)
    expect(maxLng).toBeLessThan(-121)
  })
})
