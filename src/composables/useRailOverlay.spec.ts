import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { Map } from 'maplibre-gl'

const { mockAddProtocol, mockTile } = vi.hoisted(() => ({ mockAddProtocol: vi.fn(), mockTile: vi.fn() }))

vi.mock('maplibre-gl', () => ({ addProtocol: mockAddProtocol }))
vi.mock('pmtiles', () => ({
  Protocol: class {
    tile = mockTile
  },
}))

import {
  PMTILES_PROTOCOL,
  RAIL_CONSTRUCTION_LAYER_ID,
  RAIL_EXISTING_LAYER_ID,
  RAIL_MIN_ZOOM,
  RAIL_PROPOSED_LAYER_ID,
  RAIL_SOURCE_ID,
  RAIL_SOURCE_LAYER,
  railOverlayModule,
} from './useRailOverlay'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'
import { ROUTE_LINE_WIDTH } from './useRouteLayer'

const URL = 'https://rail.example.net/rail-latest.pmtiles'

function makeMap() {
  const layers: { id: string; filter?: unknown; paint?: Record<string, unknown>; minzoom?: number; 'source-layer'?: string }[] = []
  return {
    layers,
    addSource: vi.fn(),
    addLayer: vi.fn((spec: (typeof layers)[number]) => layers.push(spec)),
    getLayer: vi.fn(() => undefined),
  }
}

type MockMap = ReturnType<typeof makeMap>

function attach(module: ReturnType<typeof railOverlayModule>, map: MockMap) {
  module.attach(map as unknown as Map)
}

describe('railOverlayModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is inert, and says so, without a tiles URL', async () => {
    const map = makeMap()
    const module = railOverlayModule(null)
    expect(module.available).toBe(false)
    expect(module.isReady(true)).toBe(false)
    attach(module, map)
    await flushPromises()
    expect(map.addSource).not.toHaveBeenCalled()
    expect(mockAddProtocol).not.toHaveBeenCalled()
  })

  it('registers the pmtiles protocol and draws the three states from the rail layer once the style is up', async () => {
    const map = makeMap()
    const module = railOverlayModule(URL)
    expect(module.available).toBe(true)
    expect(module.isReady(false)).toBe(false)
    expect(module.isReady(true)).toBe(true)

    attach(module, map)
    await flushPromises()

    expect(mockAddProtocol).toHaveBeenCalledWith(PMTILES_PROTOCOL, mockTile)
    expect(map.addSource).toHaveBeenCalledWith(RAIL_SOURCE_ID, { type: 'vector', url: `${PMTILES_PROTOCOL}://${URL}` })
    expect(map.layers.map((l) => l.id)).toEqual([RAIL_EXISTING_LAYER_ID, RAIL_CONSTRUCTION_LAYER_ID, RAIL_PROPOSED_LAYER_ID])
    for (const layer of map.layers) {
      expect(layer['source-layer']).toBe(RAIL_SOURCE_LAYER)
      expect(layer.minzoom).toBe(RAIL_MIN_ZOOM)
    }
    const [existing, construction, proposed] = map.layers
    expect(existing.filter).toEqual(['match', ['get', 'railway'], ['construction', 'proposed'], false, true])
    expect(existing.paint?.['line-dasharray']).toBeUndefined()
    // Existing railways are the strongest overlay line and planned ones fade:
    // muted ink over faint ink, and proposed thinner and lighter again.
    expect(existing.paint?.['line-color']).toBe(THEME_TOKEN_FALLBACKS['--color-ink-muted'])
    expect(construction.paint?.['line-color']).toBe(THEME_TOKEN_FALLBACKS['--color-ink-faint'])
    expect(proposed.paint?.['line-color']).toBe(THEME_TOKEN_FALLBACKS['--color-ink-faint'])
    const width = (layer: typeof existing) => layer.paint?.['line-width'] as number
    // Under the route map's line, which the editor's drawn route is wider than.
    expect(width(existing)).toBeLessThan(ROUTE_LINE_WIDTH)
    expect(width(existing)).toBeGreaterThanOrEqual(width(construction))
    expect(width(construction)).toBeGreaterThan(width(proposed))
    expect(proposed.paint?.['line-opacity']).toBeLessThan(1)
    expect(construction.paint?.['line-opacity']).toBeUndefined()
    expect(construction.filter).toEqual(['==', ['get', 'railway'], 'construction'])
    expect(proposed.filter).toEqual(['==', ['get', 'railway'], 'proposed'])
    // Long dashes for construction, short for proposed: the two are told
    // apart by pattern, as OpenRailwayMap does.
    const longDash = construction.paint?.['line-dasharray'] as number[]
    const shortDash = proposed.paint?.['line-dasharray'] as number[]
    expect(longDash[0]).toBeGreaterThan(shortDash[0])
  })

  // The registration is remembered for the life of the module, so this test
  // starts the module afresh to count from zero.
  it('registers the protocol once however many maps attach', async () => {
    vi.resetModules()
    const { railOverlayModule: freshModule } = await import('./useRailOverlay')
    const first = makeMap()
    const second = makeMap()
    attach(freshModule(URL), first)
    attach(freshModule(URL), second)
    await flushPromises()
    expect(mockAddProtocol).toHaveBeenCalledTimes(1)
    expect(first.addSource).toHaveBeenCalledTimes(1)
    expect(second.addSource).toHaveBeenCalledTimes(1)
  })

  it('adds nothing to a map it was detached from while the protocol was still loading', async () => {
    const map = makeMap()
    const module = railOverlayModule(URL)
    attach(module, map)
    module.detach()
    await flushPromises()
    expect(map.addSource).not.toHaveBeenCalled()
  })
})
