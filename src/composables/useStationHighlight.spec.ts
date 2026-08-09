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
import {
  ISOCHRONE_LAYER_ID,
  ISOCHRONE_ORIGIN_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
  isochroneEgressOpacity,
  isochroneOriginOpacity,
  isochroneHighlightFilter,
} from './useIsochroneLayer'

type Handler = (event: unknown) => void

// Records the handlers useStationHighlight registers so tests can fire
// MapLibre events at it, the same shape useStopDrag.spec.ts uses.
function makeMockMap() {
  const handlers: { type: string; layer: string | null; handler: Handler }[] = []
  const canvas = { style: { cursor: '' } }
  const setPaintProperty = vi.fn()
  const setFilter = vi.fn()
  // Truthy for any layer id by default; tests that need to simulate one layer
  // missing (e.g. the isochrone not plotted yet) override per id.
  const getLayer = vi.fn((id: string): { id: string } | undefined => ({ id }))

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
    setFilter,
  }

  function fire(type: string, layer: string | null, event: unknown = {}) {
    const matches = handlers.filter((h) => h.type === type && h.layer === layer)
    for (const match of matches) match.handler(event)
    return matches.length
  }

  return { map, canvas, fire, getLayer, setPaintProperty, setFilter }
}

function stationEvent(slug: string, name: string, lng: number, lat: number) {
  return {
    features: [
      { geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { id: '1', slug, name } },
    ],
  }
}

// Both stations the tests hover have a polygon in the plot unless a test says
// otherwise — the no-polygon case is its own describe block below.
//
// The active station stands in for the page's own single reference, which both
// this map and the Time remaining card feed. Hovering a dot here only reports
// the hover; nothing lights up until the page hands the station back.
function setup(idleCursor = () => '', egressSlugs = () => new Set(['sf', 'gilroy'])) {
  const mock = makeMockMap()
  let active: string | null = null
  const onHover = vi.fn((slug: string | null) => { active = slug })
  const highlight = useStationHighlight(mock.map as unknown as Map, {
    idleCursor,
    egressSlugs,
    activeSlug: () => active,
    onHover,
  })
  return { ...mock, highlight, onHover, setActive: (slug: string | null) => { active = slug } }
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

  it('dims the base layer and filters the highlight layer to that station', () => {
    const { fire, setPaintProperty, setFilter } = setup()

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

    expect(setPaintProperty).toHaveBeenCalledWith(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneEgressOpacity(true))
    // The highlight layer, not the base layer's opacity, is what actually
    // promotes the hovered station's polygon above its overlapping neighbours.
    expect(setFilter).toHaveBeenCalledWith(ISOCHRONE_HIGHLIGHT_LAYER_ID, isochroneHighlightFilter('sf'))
  })

  // SPA-224: the blue origin wash used to hold its full opacity, and on a
  // large driving plot the promoted orange read through it as a muted tan.
  it('dims the origin fill and strokes the highlighted polygon too', () => {
    const { fire, setPaintProperty, setFilter } = setup()

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

    expect(setPaintProperty).toHaveBeenCalledWith(ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity', isochroneOriginOpacity(true))
    expect(setFilter).toHaveBeenCalledWith(ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID, isochroneHighlightFilter('sf'))
  })

  // The other half of SPA-224: a station the plot drew no polygon for used to
  // fade every isochrone on the map and promote nothing in their place, which
  // looked exactly like its orange vanishing under the blue.
  describe('a station with no egress polygon in the plot', () => {
    it('leaves both fills at their undimmed opacity and promotes nothing', () => {
      const { fire, setPaintProperty, setFilter } = setup(() => '', () => new Set(['gilroy']))

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

      expect(setPaintProperty).toHaveBeenCalledWith(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneEgressOpacity(false))
      expect(setPaintProperty).toHaveBeenCalledWith(ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity', isochroneOriginOpacity(false))
      expect(setFilter).toHaveBeenCalledWith(ISOCHRONE_HIGHLIGHT_LAYER_ID, isochroneHighlightFilter(null))
    })

    it('still names the station in the popup, since its dot was hovered all the same', () => {
      const { fire } = setup(() => '', () => new Set())

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

      expect(mockPopupSetText).toHaveBeenCalledWith('San Francisco')
      expect(mockPopupAddTo).toHaveBeenCalled()
    })

  })

  // Each layer is guarded on its own, so one that is not plotted yet is
  // skipped without taking the others with it.
  it.each([ISOCHRONE_LAYER_ID, ISOCHRONE_ORIGIN_LAYER_ID])(
    'does not touch %s paint property when that layer does not exist yet',
    (missing) => {
      const { fire, getLayer, setPaintProperty } = setup()
      getLayer.mockImplementation((id: string) => (id === missing ? undefined : { id }))

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

      expect(setPaintProperty).not.toHaveBeenCalledWith(missing, expect.anything(), expect.anything())
      expect(setPaintProperty).toHaveBeenCalledTimes(1)
    },
  )

  it.each([ISOCHRONE_HIGHLIGHT_LAYER_ID, ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID])(
    'does not touch %s filter when that layer does not exist yet',
    (missing) => {
      const { fire, getLayer, setFilter } = setup()
      getLayer.mockImplementation((id: string) => (id === missing ? undefined : { id }))

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

      expect(setFilter).not.toHaveBeenCalledWith(missing, expect.anything())
      expect(setFilter).toHaveBeenCalledTimes(1)
    },
  )

  it('removes the popup and resets both layers when the pointer leaves', () => {
    const { fire, setPaintProperty, setFilter } = setup()
    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
    setPaintProperty.mockClear()
    setFilter.mockClear()
    mockPopupRemove.mockClear()

    fire('mouseleave', STATION_DOTS_LAYER_ID)

    expect(mockPopupRemove).toHaveBeenCalled()
    expect(setPaintProperty).toHaveBeenCalledWith(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneEgressOpacity(false))
    expect(setFilter).toHaveBeenCalledWith(ISOCHRONE_HIGHLIGHT_LAYER_ID, isochroneHighlightFilter(null))
  })

  it('restores the caller-owned idle cursor on leave, not a hardcoded default', () => {
    const { fire, canvas } = setup(() => 'crosshair')

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
    fire('mouseleave', STATION_DOTS_LAYER_ID)

    expect(canvas.style.cursor).toBe('crosshair')
  })

  it('ignores a hover event that carries no matching feature', () => {
    const { fire, canvas, setPaintProperty, setFilter } = setup()

    fire('mouseenter', STATION_DOTS_LAYER_ID, { features: [] })

    expect(canvas.style.cursor).toBe('')
    expect(setPaintProperty).not.toHaveBeenCalled()
    expect(setFilter).not.toHaveBeenCalled()
  })

  // SPA-211 shipped click-to-persist and SPA-223 takes it back: with the trip's
  // detail now in the Time remaining card, a second highlight mechanism only
  // strands a selection on the map that nothing on the page agrees with.
  describe('hover is the only way a station is highlighted', () => {
    it('binds no click handler to the station dots at all', () => {
      const { fire } = setup()

      expect(fire('click', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))).toBe(0)
    })

    it('drops the highlight the moment the pointer leaves, with nothing left standing', () => {
      const { fire, setFilter } = setup()
      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      setFilter.mockClear()

      fire('mouseleave', STATION_DOTS_LAYER_ID)

      expect(setFilter).toHaveBeenCalledWith(ISOCHRONE_HIGHLIGHT_LAYER_ID, isochroneHighlightFilter(null))
    })
  })

  describe('the station the page has made active', () => {
    it('reports a hovered dot to the page rather than highlighting it directly', () => {
      const { fire, onHover } = setup()

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      expect(onHover).toHaveBeenCalledWith('sf')

      fire('mouseleave', STATION_DOTS_LAYER_ID)
      expect(onHover).toHaveBeenLastCalledWith(null)
    })

    it('promotes a station made active elsewhere, without a pointer ever touching the map', () => {
      const { highlight, setActive, setFilter } = setup()

      setActive('gilroy')
      highlight.sync()

      expect(setFilter).toHaveBeenCalledWith(ISOCHRONE_HIGHLIGHT_LAYER_ID, isochroneHighlightFilter('gilroy'))
    })

    it('puts up no popup for one, since no dot on this map is under the pointer', () => {
      const { highlight, setActive } = setup()

      setActive('gilroy')
      highlight.sync()

      expect(mockPopupAddTo).not.toHaveBeenCalled()
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
