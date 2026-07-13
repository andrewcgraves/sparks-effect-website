import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MapView from './MapView.vue'
import { ISOCHRONE_SOURCE_ID, ISOCHRONE_LAYER_ID } from '../composables/useIsochroneLayer'
import { isochroneGeoJSON } from '../fixtures/isochrone'

const { mockAddSource, mockAddLayer, mockOn, mockRemove } = vi.hoisted(() => ({
  mockAddSource: vi.fn(),
  mockAddLayer: vi.fn(),
  mockOn: vi.fn(),
  mockRemove: vi.fn(),
}))

vi.mock('maplibre-gl', () => ({
  Map: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['addSource'] = mockAddSource
    this['addLayer'] = mockAddLayer
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
      data: isochroneGeoJSON,
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
})
