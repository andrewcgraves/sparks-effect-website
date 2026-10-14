import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { createSiteMap, MAP_CREDITS, splashZoneModules } from './siteMap'
import { mapModules } from './mapLifecycle'
import { layerStack } from './layerStack'
import { resolveIsochroneColors } from './useIsochroneLayer'
import { TOUR_SAMPLE } from '../fixtures/tourSample'

const { MockMap } = vi.hoisted(() => ({
  MockMap: vi.fn().mockImplementation(function () {}),
}))

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  Map: MockMap,
  Marker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['setLngLat'] = vi.fn(() => this)
    this['addTo'] = vi.fn(() => this)
    this['remove'] = vi.fn()
  }),
}))

function fakeMap() {
  const layers: string[] = []
  const map = {
    addSource: vi.fn(),
    getSource: vi.fn(),
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    addLayer: vi.fn((spec: { id: string }, beforeId?: string) => {
      if (beforeId) layers.splice(layers.indexOf(beforeId), 0, spec.id)
      else layers.push(spec.id)
    }),
    setPaintProperty: vi.fn(),
  }
  return { map: map as unknown as MapLibreMap, layers }
}

describe('createSiteMap', () => {
  it('uses the keyless style and credits 511 on the map', () => {
    createSiteMap({ container: document.createElement('div') })
    const options = MockMap.mock.calls.at(-1)![0]
    expect(options.style).toBe('https://tiles.openfreemap.org/styles/positron')
    expect(options.attributionControl).toEqual({ customAttribution: MAP_CREDITS })
  })

  describe('drawing load', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('draws a 3x screen at 2x, so the tour map is capped like the network map', () => {
      vi.stubGlobal('devicePixelRatio', 3)
      createSiteMap({ container: document.createElement('div') })
      expect(MockMap.mock.calls.at(-1)![0].pixelRatio).toBe(2)
    })

    it('draws a screen under 2x at its own ratio', () => {
      vi.stubGlobal('devicePixelRatio', 1.5)
      createSiteMap({ container: document.createElement('div') })
      expect(MockMap.mock.calls.at(-1)![0].pixelRatio).toBe(1.5)
    })
  })

  it('folds the credits behind ⓘ only when asked', () => {
    createSiteMap({ container: document.createElement('div') }, { compact: true })
    expect(MockMap.mock.calls.at(-1)![0].attributionControl).toEqual({
      compact: true,
      customAttribution: MAP_CREDITS,
    })
  })
})

describe('splashZoneModules', () => {
  it('draws a plot with the same layers, in the same order, as the live map', () => {
    const { routeLayer, modules } = splashZoneModules(
      {
        plot: () => TOUR_SAMPLE.plot,
        routes: () => TOUR_SAMPLE.routes,
        stations: () => TOUR_SAMPLE.stations,
        origin: () => TOUR_SAMPLE.start,
      },
      resolveIsochroneColors(),
    )
    expect(modules).toHaveLength(4)
    expect(modules[0]).toBe(routeLayer)

    const { map, layers } = fakeMap()
    mapModules(modules).sync(map, true)
    const stack = layerStack()
    expect(layers).toEqual([...layers].sort((a, b) => stack.indexOf(a) - stack.indexOf(b)))
    expect(layers).toEqual(expect.arrayContaining([
      'isochrone-origin-fill',
      'isochrone-fill',
      'route-line',
      'route-ridden-line',
      'trip-progress-line',
      'trip-progress-cap',
      'station-dots',
      'origin-walk-line',
    ]))
  })
})
