import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import TourMap from './TourMap.vue'
import { TOUR_STEPS } from './tourSteps'
import { ISOCHRONE_ORIGIN_LAYER_ID } from '../composables/useIsochroneLayer'

const map = vi.hoisted(() => ({
  handlers: {} as Record<string, () => void>,
  layers: new Set<string>(),
  calls: {
    setPaintProperty: [] as unknown[][],
    fitBounds: [] as unknown[][],
    jumpTo: [] as unknown[][],
    flyTo: [] as unknown[][],
  },
  remove: vi.fn(),
  markerRemove: vi.fn(),
  markerElements: [] as HTMLElement[],
  throwOnCreate: false,
}))

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  Map: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    if (map.throwOnCreate) throw new Error('no WebGL')
    this['on'] = (event: string, fn: () => void) => { map.handlers[event] = fn }
    this['getCanvas'] = () => ({ setAttribute: vi.fn(), style: {} })
    this['getContainer'] = () => document.createElement('div')
    this['addSource'] = vi.fn()
    this['getSource'] = vi.fn()
    this['addLayer'] = (spec: { id: string }) => map.layers.add(spec.id)
    this['getLayer'] = (id: string) => (map.layers.has(id) ? { id } : undefined)
    this['setPaintProperty'] = (...args: unknown[]) => map.calls.setPaintProperty.push(args)
    this['fitBounds'] = (...args: unknown[]) => map.calls.fitBounds.push(args)
    this['jumpTo'] = (...args: unknown[]) => map.calls.jumpTo.push(args)
    this['flyTo'] = (...args: unknown[]) => map.calls.flyTo.push(args)
    this['cameraForBounds'] = () => ({ center: [0, 0], zoom: 8 })
    this['resize'] = vi.fn()
    this['remove'] = map.remove
  }),
  Marker: vi.fn().mockImplementation(function (this: Record<string, unknown>, options?: { element?: HTMLElement }) {
    if (options?.element) map.markerElements.push(options.element)
    this['setLngLat'] = () => this
    this['addTo'] = () => this
    this['remove'] = map.markerRemove
  }),
}))

let intersect: (() => void) | null = null

class IntersectionStub {
  constructor(callback: IntersectionObserverCallback) {
    intersect = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  observe = vi.fn()
  disconnect = vi.fn()
}

class ResizeStub {
  observe = vi.fn()
  disconnect = vi.fn()
}

function stubMedia(reduced = false) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') ? reduced : true }))
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
  intersect = null
  map.handlers = {}
  map.layers = new Set()
  map.calls = { setPaintProperty: [], fitBounds: [], jumpTo: [], flyTo: [] }
  map.markerElements = []
  map.throwOnCreate = false
  vi.mocked(MapLibreMap).mockClear()
  vi.mocked(Marker).mockClear()
  map.remove.mockClear()
  map.markerRemove.mockClear()
  vi.stubGlobal('IntersectionObserver', IntersectionStub)
  vi.stubGlobal('ResizeObserver', ResizeStub)
  stubMedia()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

const step = (id: string) => TOUR_STEPS.find((s) => s.id === id)!

async function loadedMap(initial: string | null = null) {
  wrapper = mount(TourMap, { props: { step: initial ? step(initial) : null } })
  intersect!()
  map.handlers.load()
  await nextTick()
  return wrapper
}

const paintOf = (layer: string, property: string) =>
  map.calls.setPaintProperty.filter(([l, p]) => l === layer && p === property).at(-1)?.[2]

describe('TourMap', () => {
  it('builds no map until its frame nears the screen', () => {
    wrapper = mount(TourMap, { props: { step: null } })
    expect(MapLibreMap).not.toHaveBeenCalled()
    intersect!()
    expect(MapLibreMap).toHaveBeenCalledOnce()
    expect(vi.mocked(MapLibreMap).mock.calls[0][0]).toMatchObject({ interactive: false })
  })

  it('draws the plot with the live map\'s layers and eases their opacity', async () => {
    await loadedMap()
    expect(map.layers).toContain(ISOCHRONE_ORIGIN_LAYER_ID)
    expect(map.layers).toContain('trip-progress-cap')
    expect(paintOf(ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity-transition')).toEqual({ duration: 300, delay: 0 })
    expect(paintOf(ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity')).toBe(0.35)
  })

  it('dims the rest of the plot, eases to the step and labels its example', async () => {
    const w = await loadedMap()
    await w.setProps({ step: step('egress') })
    expect(paintOf(ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity')).toBe(0.12)
    expect(paintOf('isochrone-fill', 'fill-opacity')).toBe(0.35)
    expect(map.calls.fitBounds.at(-1)?.[1]).toMatchObject({ duration: 900 })
    expect(map.calls.flyTo).toHaveLength(0)
    expect(map.markerElements.at(-1)?.textContent).toContain('12m left')
    expect(map.markerElements.at(-1)?.getAttribute('aria-hidden')).toBe('true')
  })

  it('fades the start pin when the step is not about it', async () => {
    const w = await loadedMap()
    await w.setProps({ step: step('ridden') })
    expect(w.get('[data-testid="tour-map"]').attributes('data-marker-lit')).toBe('false')
    await w.setProps({ step: step('start') })
    expect(w.get('[data-testid="tour-map"]').attributes('data-marker-lit')).toBe('true')
  })

  it('puts everything back when no step is chosen', async () => {
    const w = await loadedMap('egress')
    await w.setProps({ step: null })
    expect(paintOf(ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity')).toBe(0.35)
    expect(paintOf('route-line', 'line-opacity')).toBe(1)
    expect(map.markerRemove).toHaveBeenCalled()
  })

  it('jumps instead of easing when motion is reduced', async () => {
    stubMedia(true)
    const w = await loadedMap()
    await w.setProps({ step: step('unfinished') })
    expect(map.calls.fitBounds).toHaveLength(0)
    expect(map.calls.jumpTo.length).toBeGreaterThan(0)
    expect(paintOf(ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity-transition')).toEqual({ duration: 0, delay: 0 })
  })

  it('removes the map and its label with the page', async () => {
    const w = await loadedMap('egress')
    w.unmount()
    wrapper = undefined
    expect(map.markerRemove).toHaveBeenCalled()
    expect(map.remove).toHaveBeenCalled()
  })

  it('keeps the placeholder when the browser cannot draw a map', async () => {
    map.throwOnCreate = true
    wrapper = mount(TourMap, { props: { step: null } })
    expect(() => intersect!()).not.toThrow()
    await nextTick()
    expect(wrapper.find('[data-testid="tour-map"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Loading map')
  })
})
