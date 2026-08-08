import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Map } from 'maplibre-gl'

const {
  mockPopupSetLngLat,
  mockPopupSetText,
  mockPopupAddTo,
  mockPopupRemove,
} = vi.hoisted(() => ({
  mockPopupSetLngLat: vi.fn(),
  mockPopupSetText: vi.fn(),
  mockPopupAddTo: vi.fn(),
  mockPopupRemove: vi.fn(),
}))

vi.mock('maplibre-gl', () => ({
  Popup: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['setLngLat'] = mockPopupSetLngLat
    this['setText'] = mockPopupSetText
    this['addTo'] = mockPopupAddTo
    this['remove'] = mockPopupRemove
  }),
}))

import { Popup } from 'maplibre-gl'
import { useStationHighlight } from './useStationHighlight'
import { STATION_DOTS_LAYER_ID } from './useRouteLayer'
import { ISOCHRONE_LAYER_ID, isochroneFillOpacity } from './useIsochroneLayer'

type Handler = (event: unknown) => void

// Records the handlers useStationHighlight registers so tests can fire
// MapLibre events at it, the same shape useStopDrag.spec.ts uses.
function makeMockMap() {
  const handlers: { type: string; layer: string | null; handler: Handler }[] = []
  const canvas = { style: { cursor: '' } }
  const setPaintProperty = vi.fn()
  const getLayer = vi.fn().mockReturnValue({ id: ISOCHRONE_LAYER_ID })

  const map = {
    on: vi.fn((type: string, layerOrHandler: string | Handler, maybeHandler?: Handler) => {
      if (typeof layerOrHandler === 'function') {
        handlers.push({ type, layer: null, handler: layerOrHandler })
      } else {
        handlers.push({ type, layer: layerOrHandler, handler: maybeHandler as Handler })
      }
    }),
    getCanvas: () => canvas,
    getLayer,
    setPaintProperty,
  }

  function fire(type: string, layer: string | null, event: unknown = {}) {
    const matches = handlers.filter((h) => h.type === type && h.layer === layer)
    for (const match of matches) match.handler(event)
    return matches.length
  }

  return { map, canvas, fire, getLayer, setPaintProperty }
}

function stationEvent(slug: string, name: string, lng: number, lat: number) {
  return {
    features: [
      { geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { id: '1', slug, name } },
    ],
  }
}

function setup(idleCursor = () => '') {
  const mock = makeMockMap()
  const highlight = useStationHighlight(mock.map as unknown as Map, { idleCursor })
  return { ...mock, highlight }
}

describe('useStationHighlight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPopupSetLngLat.mockReturnValue({ setText: mockPopupSetText })
    mockPopupSetText.mockReturnValue({ addTo: mockPopupAddTo })
  })

  it('creates a popup with no close button or close-on-click, so hover does not fight the pointer', () => {
    setup()
    expect(Popup).toHaveBeenCalledWith(expect.objectContaining({ closeButton: false, closeOnClick: false }))
  })

  it('shows a pointer cursor and the station name in the popup on hover', () => {
    const { fire, canvas } = setup()

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

    expect(canvas.style.cursor).toBe('pointer')
    expect(mockPopupSetLngLat).toHaveBeenCalledWith([-122.41, 37.77])
    expect(mockPopupSetText).toHaveBeenCalledWith('San Francisco')
    expect(mockPopupAddTo).toHaveBeenCalled()
  })

  it('highlights that station in the isochrone fill-opacity paint property', () => {
    const { fire, setPaintProperty } = setup()

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

    expect(setPaintProperty).toHaveBeenCalledWith(
      ISOCHRONE_LAYER_ID,
      'fill-opacity',
      isochroneFillOpacity('sf'),
    )
  })

  it('does not touch the isochrone paint property when the layer does not exist yet', () => {
    const { fire, getLayer, setPaintProperty } = setup()
    getLayer.mockReturnValue(undefined)

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

    expect(setPaintProperty).not.toHaveBeenCalled()
  })

  it('removes the popup and resets fill-opacity when the pointer leaves with nothing selected', () => {
    const { fire, setPaintProperty } = setup()
    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
    setPaintProperty.mockClear()
    mockPopupRemove.mockClear()

    fire('mouseleave', STATION_DOTS_LAYER_ID)

    expect(mockPopupRemove).toHaveBeenCalled()
    expect(setPaintProperty).toHaveBeenCalledWith(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneFillOpacity(null))
  })

  it('restores the caller-owned idle cursor on leave, not a hardcoded default', () => {
    const { fire, canvas } = setup(() => 'crosshair')

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
    fire('mouseleave', STATION_DOTS_LAYER_ID)

    expect(canvas.style.cursor).toBe('crosshair')
  })

  it('ignores a hover event that carries no matching feature', () => {
    const { fire, canvas, setPaintProperty } = setup()

    fire('mouseenter', STATION_DOTS_LAYER_ID, { features: [] })

    expect(canvas.style.cursor).toBe('')
    expect(setPaintProperty).not.toHaveBeenCalled()
  })

  describe('click persists the highlight', () => {
    it('keeps the popup and highlight up after the pointer leaves a clicked station', () => {
      const { fire, setPaintProperty } = setup()
      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      fire('click', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      setPaintProperty.mockClear()
      mockPopupRemove.mockClear()

      fire('mouseleave', STATION_DOTS_LAYER_ID)

      expect(mockPopupRemove).not.toHaveBeenCalled()
      expect(setPaintProperty).toHaveBeenCalledWith(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneFillOpacity('sf'))
    })

    it('shows a hovered station over a standing selection, then falls back to the selection on leave', () => {
      const { fire, setPaintProperty } = setup()
      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      fire('click', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      fire('mouseleave', STATION_DOTS_LAYER_ID)
      setPaintProperty.mockClear()

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('gilroy', 'Gilroy', -121.57, 37.0))
      expect(setPaintProperty).toHaveBeenLastCalledWith(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneFillOpacity('gilroy'))

      fire('mouseleave', STATION_DOTS_LAYER_ID)
      expect(setPaintProperty).toHaveBeenLastCalledWith(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneFillOpacity('sf'))
    })

    it('moves the persisted selection to whichever station is clicked next', () => {
      const { fire, setPaintProperty } = setup()
      fire('click', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      fire('mouseleave', STATION_DOTS_LAYER_ID)
      setPaintProperty.mockClear()

      fire('click', STATION_DOTS_LAYER_ID, stationEvent('gilroy', 'Gilroy', -121.57, 37.0))

      expect(setPaintProperty).toHaveBeenCalledWith(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneFillOpacity('gilroy'))
    })

    it('ignores a click event that carries no matching feature', () => {
      const { fire, setPaintProperty } = setup()

      fire('click', STATION_DOTS_LAYER_ID, { features: [] })
      fire('mouseleave', STATION_DOTS_LAYER_ID)

      expect(setPaintProperty).toHaveBeenCalledWith(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneFillOpacity(null))
      expect(mockPopupRemove).toHaveBeenCalled()
    })
  })

  describe('release', () => {
    it('removes the popup, since it is a DOM element the map teardown would not collect', () => {
      const { highlight } = setup()

      highlight.release()

      expect(mockPopupRemove).toHaveBeenCalled()
    })
  })
})
