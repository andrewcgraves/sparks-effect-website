import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Map } from 'maplibre-gl'

const {
  mockPopupSetLngLat,
  mockPopupSetDOMContent,
  mockPopupAddTo,
  mockPopupRemove,
} = vi.hoisted(() => ({
  mockPopupSetLngLat: vi.fn(),
  mockPopupSetDOMContent: vi.fn(),
  mockPopupAddTo: vi.fn(),
  mockPopupRemove: vi.fn(),
}))

vi.mock('maplibre-gl', () => ({
  Popup: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['setLngLat'] = mockPopupSetLngLat
    this['setDOMContent'] = mockPopupSetDOMContent
    this['addTo'] = mockPopupAddTo
    this['remove'] = mockPopupRemove
  }),
}))

vi.mock('./useIsochroneLayer', async (importOriginal) => ({
  ...await importOriginal<typeof import('./useIsochroneLayer')>(),
  showIsochroneHighlight: vi.fn(),
}))

import { Popup } from 'maplibre-gl'
import { TOOLTIP_MAP_POPUP_CLASS, TOOLTIP_PANEL_CLASS } from '../components/tooltip'
import { useStationHighlight } from './useStationHighlight'
import { PROGRESS_CAP_HIT_LAYER_ID, STATION_DOTS_LAYER_ID } from './useRouteLayer'
import { showIsochroneHighlight } from './useIsochroneLayer'

type Handler = (event: unknown) => void

function makeMockMap() {
  const handlers: { type: string; layer: string | null; handler: Handler }[] = []
  const canvas = { style: { cursor: '' } }
  const setPaintProperty = vi.fn()
  const showHighlight = vi.mocked(showIsochroneHighlight)
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
  }

  function fire(type: string, layer: string | null, event: unknown = {}) {
    const matches = handlers.filter((h) => h.type === type && h.layer === layer)
    for (const match of matches) match.handler(event)
    return matches.length
  }

  // MapLibre hands one click event to the layer listeners that have features
  // under it and then to the map-wide ones, in the order they were bound.
  function tap(event: { features?: unknown[] }) {
    let prevented = false
    const click = {
      ...event,
      preventDefault: () => { prevented = true },
      get defaultPrevented() { return prevented },
    }
    for (const h of handlers) {
      if (h.type !== 'click') continue
      if (h.layer === null || (h.layer === STATION_DOTS_LAYER_ID && (event.features?.length ?? 0) > 0)) {
        h.handler(click)
      }
    }
  }

  return { map, canvas, fire, tap, getLayer, setPaintProperty, showHighlight }
}

function stationEvent(slug: string, name: string, lng: number, lat: number) {
  return {
    features: [
      { geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { id: '1', slug, name } },
    ],
  }
}

function capEvent(
  to: string,
  fraction: number,
  rideSecs: number,
  lng = -120.5,
  lat = 37.3,
) {
  return {
    features: [
      {
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { from: 'gilroy', to, fraction, remaining_secs: rideSecs * fraction, ride_secs: rideSecs },
      },
    ],
  }
}

function setup(
  idleCursor = () => '',
  egressSlugs = () => new Set(['sf', 'gilroy']),
  remainingSecs: (slug: string) => number | null = () => null,
  stationName: (slug: string) => string = (slug) => slug,
) {
  const mock = makeMockMap()
  let active: string | null = null
  const onHover = vi.fn((slug: string | null) => { active = slug })
  const highlight = useStationHighlight(mock.map as unknown as Map, {
    idleCursor,
    egressSlugs,
    activeSlug: () => active,
    remainingSecs,
    stationName,
    onHover,
  })
  return { ...mock, highlight, onHover, setActive: (slug: string | null) => { active = slug } }
}

function popupNode(): HTMLElement | undefined {
  return mockPopupSetDOMContent.mock.calls[0]?.[0] as HTMLElement | undefined
}

function popupNamed(name: string): boolean {
  const node = popupNode()
  return node?.textContent === name && node.className.includes(TOOLTIP_PANEL_CLASS.split(' ')[0])
}

describe('useStationHighlight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPopupSetLngLat.mockReturnValue({ setDOMContent: mockPopupSetDOMContent })
    mockPopupSetDOMContent.mockReturnValue({ addTo: mockPopupAddTo })
  })

  it('creates a popup wearing the tooltip chrome, with no close button that would fight the pointer', () => {
    setup()
    expect(Popup).toHaveBeenCalledWith(expect.objectContaining({
      closeButton: false,
      closeOnClick: false,
      className: TOOLTIP_MAP_POPUP_CLASS,
    }))
  })

  it('shows a pointer cursor and the station name in the popup on hover', () => {
    const { fire, canvas } = setup()

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

    expect(canvas.style.cursor).toBe('pointer')
    expect(mockPopupSetLngLat).toHaveBeenCalledWith([-122.41, 37.77])
    expect(popupNamed('San Francisco')).toBe(true)
    expect(mockPopupAddTo).toHaveBeenCalled()
  })

  // SPA-524, SPA-526: the rest of the splash zone rests light already, so a
  // hover raises the one station without fading the whole map.
  it('leaves both fills alone and puts that station on the highlight layers', () => {
    const { fire, setPaintProperty, showHighlight } = setup()

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

    expect(setPaintProperty).not.toHaveBeenCalled()
    expect(showHighlight).toHaveBeenLastCalledWith(expect.anything(), 'sf')
  })

  // The other half of SPA-224: a station the plot drew no polygon for used to
  // fade every isochrone on the map and promote nothing in their place, which
  // looked exactly like its orange vanishing under the blue.
  describe('a station with no egress polygon in the plot', () => {
    it('promotes nothing', () => {
      const { fire, setPaintProperty, showHighlight } = setup(() => '', () => new Set(['gilroy']))

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

      expect(setPaintProperty).not.toHaveBeenCalled()
      expect(showHighlight).toHaveBeenLastCalledWith(expect.anything(), null)
    })

    it('still names the station in the popup, since its dot was hovered all the same', () => {
      const { fire } = setup(() => '', () => new Set())

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

      expect(popupNamed('San Francisco')).toBe(true)
      expect(popupNode()?.textContent).not.toContain('left')
      expect(mockPopupAddTo).toHaveBeenCalled()
    })

  })

  it('removes the popup and drops the highlight when the pointer leaves', () => {
    const { fire, showHighlight } = setup()
    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
    showHighlight.mockClear()
    mockPopupRemove.mockClear()

    fire('mouseleave', STATION_DOTS_LAYER_ID)

    expect(mockPopupRemove).toHaveBeenCalled()
    expect(showHighlight).toHaveBeenLastCalledWith(expect.anything(), null)
  })

  it('restores the caller-owned idle cursor on leave, not a hardcoded default', () => {
    const { fire, canvas } = setup(() => 'crosshair')

    fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
    fire('mouseleave', STATION_DOTS_LAYER_ID)

    expect(canvas.style.cursor).toBe('crosshair')
  })

  it('ignores a hover event that carries no matching feature', () => {
    const { fire, canvas, setPaintProperty, showHighlight } = setup()

    fire('mouseenter', STATION_DOTS_LAYER_ID, { features: [] })

    expect(canvas.style.cursor).toBe('')
    expect(setPaintProperty).not.toHaveBeenCalled()
    expect(showHighlight).not.toHaveBeenCalled()
  })

  // SPA-223 took click-to-persist away because it stranded a selection the
  // page disagreed with; SPA-494 brings a tap back for touch screens, which
  // have no hover, and reports it through onHover so the card agrees.
  describe('tapping a station', () => {
    it('opens the popup with its name and promotes its polygon', () => {
      const { tap, onHover, showHighlight } = setup()

      tap(stationEvent('sf', 'San Francisco', -122.41, 37.77))

      expect(mockPopupSetLngLat).toHaveBeenCalledWith([-122.41, 37.77])
      expect(popupNamed('San Francisco')).toBe(true)
      expect(mockPopupAddTo).toHaveBeenCalled()
      expect(onHover).toHaveBeenLastCalledWith('sf')
      expect(showHighlight).toHaveBeenLastCalledWith(expect.anything(), 'sf')
    })

    it('keeps the popup up when the emulated pointer leaves the dot', () => {
      const { fire, tap, onHover } = setup()
      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      tap(stationEvent('sf', 'San Francisco', -122.41, 37.77))
      mockPopupRemove.mockClear()
      mockPopupSetDOMContent.mockClear()

      fire('mouseleave', STATION_DOTS_LAYER_ID)

      expect(mockPopupRemove).not.toHaveBeenCalled()
      expect(popupNamed('San Francisco')).toBe(true)
      expect(onHover).toHaveBeenLastCalledWith('sf')
    })

    it('closes the popup and drops the promote on a tap anywhere off the dots', () => {
      const { tap, onHover, showHighlight } = setup()
      tap(stationEvent('sf', 'San Francisco', -122.41, 37.77))
      mockPopupRemove.mockClear()
      showHighlight.mockClear()

      tap({ features: [] })

      expect(mockPopupRemove).toHaveBeenCalled()
      expect(onHover).toHaveBeenLastCalledWith(null)
      expect(showHighlight).toHaveBeenLastCalledWith(expect.anything(), null)
    })

    it('moves the popup to the next station tapped', () => {
      const { tap, onHover } = setup()
      tap(stationEvent('sf', 'San Francisco', -122.41, 37.77))
      mockPopupSetDOMContent.mockClear()

      tap(stationEvent('gilroy', 'Gilroy', -121.57, 37.0))

      expect(popupNamed('Gilroy')).toBe(true)
      expect(onHover).toHaveBeenLastCalledWith('gilroy')
    })

    // A touch screen's emulated pointer moves straight from one dot to the
    // next, and MapLibre only fires mouseenter on entering the layer, so the
    // second tap arrives with the first station still counted as hovered.
    it('names the second station when one dot is tapped straight after another', () => {
      const { fire, tap, onHover } = setup()
      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      tap(stationEvent('sf', 'San Francisco', -122.41, 37.77))
      mockPopupSetDOMContent.mockClear()

      tap(stationEvent('gilroy', 'Gilroy', -121.57, 37.0))

      expect(popupNamed('Gilroy')).toBe(true)
      expect(onHover).toHaveBeenLastCalledWith('gilroy')
    })

    it('comes back to the tapped station when the pointer leaves the unfinished-leg cap', () => {
      const { fire, tap, onHover, canvas } = setup(() => 'crosshair')
      tap(stationEvent('sf', 'San Francisco', -122.41, 37.77))
      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, capEvent('merced', 0.38, 1839))
      expect(onHover).toHaveBeenLastCalledWith(null)
      mockPopupSetDOMContent.mockClear()

      fire('mouseleave', PROGRESS_CAP_HIT_LAYER_ID)

      expect(onHover).toHaveBeenLastCalledWith('sf')
      expect(popupNamed('San Francisco')).toBe(true)
      expect(canvas.style.cursor).toBe('crosshair')
    })

    it('leaves the page alone on a tap off the dots when nothing was tapped', () => {
      const { tap, onHover } = setup()

      tap({ features: [] })

      expect(onHover).not.toHaveBeenCalled()
    })

    it('still drops a mouse hover the moment the pointer leaves, with nothing tapped', () => {
      const { fire, showHighlight } = setup()
      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      showHighlight.mockClear()

      fire('mouseleave', STATION_DOTS_LAYER_ID)

      expect(showHighlight).toHaveBeenLastCalledWith(expect.anything(), null)
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
      const { highlight, setActive, showHighlight } = setup()

      setActive('gilroy')
      highlight.sync()

      expect(showHighlight).toHaveBeenLastCalledWith(expect.anything(), 'gilroy')
    })

    it('puts up no popup for one, since no dot on this map is under the pointer', () => {
      const { highlight, setActive } = setup()

      setActive('gilroy')
      highlight.sync()

      expect(mockPopupAddTo).not.toHaveBeenCalled()
    })
  })

  describe('remaining time in the popup', () => {
    it('names a reachable station and how much budget is left on leaving it', () => {
      const { fire } = setup(undefined, undefined, (slug) => slug === 'sf' ? 2700 : null)

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

      const node = popupNode()
      expect(node?.textContent).toContain('San Francisco')
      expect(node?.textContent).toContain('45m left')
      expect(node?.className).toContain(TOOLTIP_PANEL_CLASS.split(' ')[0])
      expect(Popup).toHaveBeenCalledWith(expect.objectContaining({
        className: TOOLTIP_MAP_POPUP_CLASS,
      }))
    })

    it('renders hours the way the card does', () => {
      const { fire } = setup(undefined, undefined, () => 5400)

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sj', 'San Jose', -121.9, 37.3))

      expect(popupNode()?.textContent).toContain('1h 30m left')
      expect(popupNode()?.textContent).not.toContain('90m left')
    })

    it('stays name-only when the lookup has nothing for that slug', () => {
      const { fire } = setup(undefined, undefined, () => null)

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))

      expect(popupNamed('San Francisco')).toBe(true)
      expect(popupNode()?.textContent).not.toContain('left')
      expect(popupNode()?.textContent).not.toContain('0m')
    })

    it('prints 0m left when the rider leaves with nothing, so a finished trip is not an unreachable one', () => {
      const { fire } = setup(undefined, undefined, () => 0)

      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('gilroy', 'Gilroy', -121.57, 37.0))

      expect(popupNode()?.textContent).toContain('Gilroy')
      expect(popupNode()?.textContent).toContain('0m left')
    })
  })

  describe('the unfinished-leg cap', () => {
    it('explains how far the hop got, naming the station the rider was heading for', () => {
      const { fire } = setup(undefined, undefined, undefined, (slug) =>
        slug === 'merced' ? 'Merced' : slug,
      )

      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, capEvent('merced', 0.38, 1839))

      expect(popupNode()?.textContent).toBe('38% of the way to Merced — 19m short')
      expect(mockPopupSetLngLat).toHaveBeenCalledWith([-120.5, 37.3])
      expect(mockPopupAddTo).toHaveBeenCalled()
    })

    it('shows a pointer cursor without promoting a station, because the cap is not one', () => {
      const { fire, canvas, onHover, setPaintProperty, showHighlight } = setup()

      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, capEvent('merced', 0.38, 1839))

      expect(canvas.style.cursor).toBe('pointer')
      expect(onHover).not.toHaveBeenCalled()
      expect(setPaintProperty).not.toHaveBeenCalled()
      expect(showHighlight).toHaveBeenLastCalledWith(expect.anything(), null)
    })

    it('falls back to the slug when the stations list has no name for that hop', () => {
      const { fire } = setup()

      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, capEvent('merced', 0.38, 1839))

      expect(popupNode()?.textContent).toBe('38% of the way to merced — 19m short')
    })

    it('reads numeric properties even when MapLibre has stringified them', () => {
      const { fire } = setup(undefined, undefined, undefined, () => 'Merced')

      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, {
        features: [
          {
            geometry: { type: 'Point', coordinates: [-120.5, 37.3] },
            properties: { to: 'merced', fraction: '0.38', ride_secs: '1839' },
          },
        ],
      })

      expect(popupNode()?.textContent).toBe('38% of the way to Merced — 19m short')
    })

    it('ignores a hover that carries no unfinished hop', () => {
      const { fire, canvas } = setup()

      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, { features: [] })

      expect(canvas.style.cursor).toBe('')
      expect(mockPopupAddTo).not.toHaveBeenCalled()
    })

    it('removes the popup and restores the idle cursor when the pointer leaves', () => {
      const { fire, canvas } = setup(() => 'crosshair')
      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, capEvent('merced', 0.38, 1839))
      mockPopupRemove.mockClear()

      fire('mouseleave', PROGRESS_CAP_HIT_LAYER_ID)

      expect(mockPopupRemove).toHaveBeenCalled()
      expect(canvas.style.cursor).toBe('crosshair')
    })

    it('drops a leftover station promote when the pointer moves onto the cap', () => {
      const { fire, onHover, showHighlight } = setup()
      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      onHover.mockClear()
      showHighlight.mockClear()
      mockPopupSetDOMContent.mockClear()

      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, capEvent('merced', 0.38, 1839))

      expect(onHover).toHaveBeenCalledWith(null)
      expect(showHighlight).toHaveBeenLastCalledWith(expect.anything(), null)
      expect(popupNode()?.textContent).toBe('38% of the way to merced — 19m short')
    })

    it('keeps the cap popup if the pointer leaves a station while still on the cap', () => {
      const { fire, canvas } = setup()
      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, capEvent('merced', 0.38, 1839))
      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      mockPopupRemove.mockClear()
      mockPopupSetDOMContent.mockClear()

      fire('mouseleave', STATION_DOTS_LAYER_ID)

      expect(canvas.style.cursor).toBe('pointer')
      expect(mockPopupRemove).not.toHaveBeenCalled()
      expect(popupNode()?.textContent).toBe('38% of the way to merced — 19m short')
    })

    it('restores the station popup when the pointer leaves the cap onto a station still under it', () => {
      const { fire, onHover } = setup()
      fire('mouseenter', STATION_DOTS_LAYER_ID, stationEvent('sf', 'San Francisco', -122.41, 37.77))
      fire('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, capEvent('merced', 0.38, 1839))
      mockPopupSetDOMContent.mockClear()
      onHover.mockClear()

      fire('mouseleave', PROGRESS_CAP_HIT_LAYER_ID)

      expect(onHover).toHaveBeenCalledWith('sf')
      expect(popupNode()?.textContent).toBe('San Francisco')
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
