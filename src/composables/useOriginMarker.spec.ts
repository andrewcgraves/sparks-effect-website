import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Map } from 'maplibre-gl'

const mockSetLngLat = vi.fn()
const mockAddTo = vi.fn()
const mockMarkerRemove = vi.fn()

mockSetLngLat.mockReturnValue({ addTo: mockAddTo })
mockAddTo.mockReturnValue({ setLngLat: mockSetLngLat })

vi.mock('maplibre-gl', () => ({
  Marker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['setLngLat'] = mockSetLngLat
    this['addTo'] = mockAddTo
    this['remove'] = mockMarkerRemove
  }),
}))

import { Marker } from 'maplibre-gl'
import { originMarkerModule } from './useOriginMarker'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'

function makeMockMap(): Map {
  return {} as Map
}

describe('originMarkerModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetLngLat.mockReturnValue({ addTo: mockAddTo })
  })

  it('paints the marker with the brand coral rather than the MapLibre default', () => {
    originMarkerModule(() => ({ lat: 37.33, lng: -121.89 }))
    expect(Marker).toHaveBeenCalledWith({ color: THEME_TOKEN_FALLBACKS['--color-coral'] })
  })

  // A Marker is a DOM element over the canvas rather than a style layer, so it
  // is the one module that does not have to wait for the style to load.
  it('is ready before the style has loaded', () => {
    const module = originMarkerModule(() => ({ lat: 37.33, lng: -121.89 }))
    expect(module.isReady(false)).toBe(true)
  })

  it('places the marker on attach when there is an origin', () => {
    const map = makeMockMap()
    const module = originMarkerModule(() => ({ lat: 37.33, lng: -121.89 }))

    module.attach(map)

    expect(mockSetLngLat).toHaveBeenCalledWith([-121.89, 37.33])
    expect(mockAddTo).toHaveBeenCalledWith(map)
  })

  it('does not place the marker when there is no origin', () => {
    const module = originMarkerModule(() => null)

    module.attach(makeMockMap())

    expect(mockSetLngLat).not.toHaveBeenCalled()
    expect(mockAddTo).not.toHaveBeenCalled()
  })

  it('moves the marker when the origin changes', () => {
    const map = makeMockMap()
    let origin: { lat: number; lng: number } | null = { lat: 37.33, lng: -121.89 }
    const module = originMarkerModule(() => origin)
    module.attach(map)
    vi.clearAllMocks()
    mockSetLngLat.mockReturnValue({ addTo: mockAddTo })

    origin = { lat: 38.0, lng: -122.5 }
    module.sync(map)

    expect(mockSetLngLat).toHaveBeenCalledWith([-122.5, 38.0])
    expect(mockAddTo).toHaveBeenCalledWith(map)
  })

  it('removes the marker when the origin goes away', () => {
    const map = makeMockMap()
    let origin: { lat: number; lng: number } | null = { lat: 37.33, lng: -121.89 }
    const module = originMarkerModule(() => origin)
    module.attach(map)

    origin = null
    module.sync(map)

    expect(mockMarkerRemove).toHaveBeenCalled()
  })

  // The marker is a DOM element the map's own teardown would not collect.
  it('removes the marker on detach', () => {
    const module = originMarkerModule(() => ({ lat: 37.33, lng: -121.89 }))
    module.attach(makeMockMap())

    module.detach()

    expect(mockMarkerRemove).toHaveBeenCalled()
  })

  it('passes lng before lat to setLngLat (MapLibre convention)', () => {
    const module = originMarkerModule(() => ({ lat: 10.0, lng: 20.0 }))

    module.attach(makeMockMap())

    const [lng, lat] = mockSetLngLat.mock.calls[0][0]
    expect(lng).toBe(20.0)
    expect(lat).toBe(10.0)
  })
})
