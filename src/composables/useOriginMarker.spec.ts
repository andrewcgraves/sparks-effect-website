import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
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
import { useOriginMarker } from './useOriginMarker'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'

function makeMockMap(): Map {
  return {} as Map
}

describe('useOriginMarker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetLngLat.mockReturnValue({ addTo: mockAddTo })
  })

  it('paints the marker with the brand coral rather than the MapLibre default', () => {
    useOriginMarker(makeMockMap(), ref({ lat: 37.33, lng: -121.89 }))
    expect(Marker).toHaveBeenCalledWith({ color: THEME_TOKEN_FALLBACKS['--color-coral'] })
  })

  it('places the marker immediately when origin is provided', () => {
    const map = makeMockMap()
    const origin = ref<{ lat: number; lng: number } | null>({ lat: 37.33, lng: -121.89 })

    useOriginMarker(map, origin)

    expect(mockSetLngLat).toHaveBeenCalledWith([-121.89, 37.33])
    expect(mockAddTo).toHaveBeenCalledWith(map)
  })

  it('does not place the marker when origin is null', () => {
    const map = makeMockMap()
    const origin = ref<{ lat: number; lng: number } | null>(null)

    useOriginMarker(map, origin)

    expect(mockSetLngLat).not.toHaveBeenCalled()
    expect(mockAddTo).not.toHaveBeenCalled()
  })

  it('updates marker position when origin coordinates change', async () => {
    const map = makeMockMap()
    const origin = ref<{ lat: number; lng: number } | null>({ lat: 37.33, lng: -121.89 })

    useOriginMarker(map, origin)
    vi.clearAllMocks()
    mockSetLngLat.mockReturnValue({ addTo: mockAddTo })

    origin.value = { lat: 38.0, lng: -122.5 }
    await Promise.resolve()

    expect(mockSetLngLat).toHaveBeenCalledWith([-122.5, 38.0])
    expect(mockAddTo).toHaveBeenCalledWith(map)
  })

  it('removes the marker when origin changes to null', async () => {
    const map = makeMockMap()
    const origin = ref<{ lat: number; lng: number } | null>({ lat: 37.33, lng: -121.89 })

    useOriginMarker(map, origin)

    origin.value = null
    await Promise.resolve()

    expect(mockMarkerRemove).toHaveBeenCalled()
  })

  it('passes lng before lat to setLngLat (MapLibre convention)', () => {
    const map = makeMockMap()
    const origin = ref<{ lat: number; lng: number } | null>({ lat: 10.0, lng: 20.0 })

    useOriginMarker(map, origin)

    const [lng, lat] = mockSetLngLat.mock.calls[0][0]
    expect(lng).toBe(20.0)
    expect(lat).toBe(10.0)
  })
})
