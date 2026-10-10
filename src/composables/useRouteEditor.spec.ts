import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Feature, LineString, Point } from 'geojson'
import { FRESNO_BBOX, fresnoPoint, fresnoTiles } from '../fixtures/rail/fresno'
import type { RecordingSource } from '../fixtures/rail/fresno'

// A fake of the terra-draw 1.37 surface the editor relies on: a store of
// features keyed by id, the mode registry, select/finish events, and the
// line-string mode's `snapping.toCustom` and `pointerEvents.leftClick`
// options, which are what a click goes through. `click` below replays the
// order the real mode uses: the snap callback for the hover guide, then the
// pointer-event gate for the click itself.
const { fakes, tileSources, tileFailures } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void
  type Options = Record<string, unknown>
  class FakeMode {
    mode: string
    options: Options
    constructor(mode: string, options: Options = {}) {
      this.mode = mode
      this.options = options
    }
  }
  class FakeTerraDraw {
    adapter: unknown
    modes: Record<string, FakeMode> = {}
    store = new Map<string | number, Feature>()
    listeners: Record<string, Listener[]> = {}
    mode = 'static'
    enabled = false
    selected: string | number | null = null
    nextId = 0
    constructor(options: { adapter: unknown; modes: FakeMode[] }) {
      this.adapter = options.adapter
      for (const mode of options.modes) this.modes[mode.mode] = mode
      fakes.instances.push(this)
    }
    // The adapter adds its layers on top of the map's when it registers.
    start() {
      this.enabled = true
      const map = (this.adapter as { config: { map?: { addLayer?: (spec: { id: string }) => void } } }).config.map
      for (const kind of ['polygon', 'polygon-outline', 'linestring', 'point', 'point-marker']) {
        map?.addLayer?.({ id: `route-editor-${kind}` })
      }
    }
    stop() {
      this.enabled = false
      this.store.clear()
    }
    getMode() {
      return this.mode
    }
    setMode(mode: string) {
      if (mode !== 'static' && !this.modes[mode]) throw new Error('No mode with this name present')
      this.mode = mode
      if (mode !== 'select') this.selected = null
    }
    updateModeOptions(mode: string, options: Options) {
      Object.assign(this.modes[mode].options, options)
    }
    getFeatureId() {
      return `feature-${++this.nextId}`
    }
    hasFeature(id: string | number) {
      return this.store.has(id)
    }
    // terra-draw 1.37 validates every feature against its mode: the mode must
    // be one it was given, and no coordinate may be finer than the adapter's
    // precision (9 decimals by default). A refused feature is not stored and
    // nothing is thrown, so a route that fails here is never drawn.
    validate(feature: Feature): string | undefined {
      const mode = (feature.properties as { mode?: string } | null)?.mode
      if (!mode || !this.modes[mode]) return `${mode} mode is not in the list of instantiated modes`
      const decimals = (n: number) => {
        let factor = 1
        let count = 0
        while (Math.round(n * factor) / factor !== n) {
          factor *= 10
          count++
        }
        return count
      }
      const geometry = feature.geometry as LineString | Point
      const coordinates = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates
      if (coordinates.some(([lng, lat]) => decimals(lng) > 9 || decimals(lat) > 9)) {
        return 'Feature has coordinates with excessive precision'
      }
      return undefined
    }
    addFeatures(features: Feature[]) {
      const results = features.map((f) => ({ id: f.id, reason: this.validate(f) }))
      const added = features.filter((_, i) => results[i].reason === undefined)
      for (const feature of added) this.store.set(feature.id!, structuredClone(feature))
      if (added.length) this.emit('change', added.map((f) => f.id), 'create')
      return results.map(({ id, reason }) => ({ id, valid: reason === undefined, reason }))
    }
    removeFeatures(ids: (string | number)[]) {
      for (const id of ids) this.store.delete(id)
      this.emit('change', ids, 'delete')
    }
    updateFeatureGeometry(id: string | number, geometry: LineString | Point) {
      const feature = this.store.get(id)
      if (!feature) throw new Error(`No feature with id ${id} present in store`)
      if (feature.geometry.type !== geometry.type) throw new Error('Geometry type mismatch')
      const reason = this.validate({ ...feature, geometry })
      if (reason) throw new Error(`Feature validation failed: ${reason}`)
      feature.geometry = structuredClone(geometry)
      this.emit('change', [id], 'update', { origin: 'api' })
    }
    getSnapshot() {
      return [...this.store.values()].map((f) => structuredClone(f))
    }
    getSnapshotFeature(id: string | number) {
      const feature = this.store.get(id)
      return feature ? structuredClone(feature) : undefined
    }
    selectFeature(id: string | number) {
      this.mode = 'select'
      this.selected = id
    }
    on(event: string, listener: Listener) {
      ;(this.listeners[event] ??= []).push(listener)
    }
    off(event: string, listener: Listener) {
      this.listeners[event] = (this.listeners[event] ?? []).filter((l) => l !== listener)
    }
    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners[event] ?? []) listener(...args)
    }
  }
  const fakes = { FakeTerraDraw, FakeMode, instances: [] as InstanceType<typeof FakeTerraDraw>[] }
  const tileSources: RecordingSource[] = []
  const tileFailures = { remaining: 0 }
  return { fakes, tileSources, tileFailures }
})

vi.mock('maplibre-gl', () => ({ addProtocol: vi.fn() }))
vi.mock('pmtiles', () => ({ Protocol: class { tile = vi.fn() } }))

vi.mock('terra-draw', () => ({
  TerraDraw: fakes.FakeTerraDraw,
  TerraDrawLineStringMode: class extends fakes.FakeMode {
    constructor(options: Record<string, unknown>) {
      super('linestring', options)
    }
  },
  TerraDrawPointMode: class extends fakes.FakeMode {
    constructor(options: Record<string, unknown>) {
      super('point', options)
    }
  },
  TerraDrawSelectMode: class extends fakes.FakeMode {
    constructor(options: Record<string, unknown>) {
      super('select', options)
    }
  },
}))

vi.mock('terra-draw-maplibre-gl-adapter', () => ({
  TerraDrawMapLibreGLAdapter: class {
    config: unknown
    constructor(config: unknown) {
      this.config = config
    }
  },
}))

vi.mock('../rail/pmtilesSource', () => ({
  pmtilesSource: () => {
    const source = fresnoTiles()
    const tile = source.tile.bind(source)
    source.tile = async (z, x, y) => {
      if (tileFailures.remaining > 0) {
        tileFailures.remaining--
        throw new Error('tile fetch failed')
      }
      return tile(z, x, y)
    }
    tileSources.push(source)
    return source
  },
}))

import {
  GRAPH_DEBOUNCE_MS,
  ROUTE_EDITOR_PREFIX,
  snapLabel,
  toDrawPrecision,
  useRouteEditor,
  viewportBbox,
} from './useRouteEditor'
import { ROUTE_EDITOR_LAYER_IDS } from './railLayerIds'
import { layerStack } from './layerStack'
import { RAIL_EXISTING_LAYER_ID, RAIL_PROPOSED_LAYER_ID, railOverlayModule } from './useRailOverlay'
import { ROUTE_LINE_WIDTH } from './useRouteLayer'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'
import type { LngLat } from '../rail/railGraph'
import { RailGraph } from '../rail/railGraph'

const TILES = 'https://rail.example.net/rail.pmtiles'

type FakeDraw = InstanceType<typeof fakes.FakeTerraDraw>

function makeMap(zoom = 14, bbox = FRESNO_BBOX) {
  const handlers: Record<string, (() => void)[]> = {}
  // A basemap of its own, labels on top, so ordering is checked against it.
  const layers = ['background', 'road', 'place-label']
  const fire = (type: string) => (handlers[type] ?? []).forEach((h) => h())
  const place = (id: string, before?: string) => {
    const at = before === undefined ? -1 : layers.indexOf(before)
    if (at === -1) layers.push(id)
    else layers.splice(at, 0, id)
    fire('styledata')
  }
  return {
    zoom,
    layers,
    getLayersOrder: () => [...layers],
    addSource: vi.fn(),
    addLayer: (spec: { id: string }, before?: string) => place(spec.id, before),
    moveLayer: vi.fn((id: string, before?: string) => {
      layers.splice(layers.indexOf(id), 1)
      place(id, before)
    }),
    getZoom() {
      return this.zoom
    },
    getBounds: () => ({ getWest: () => bbox[0], getSouth: () => bbox[1], getEast: () => bbox[2], getNorth: () => bbox[3] }),
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    on: vi.fn((type: string, handler: () => void) => {
      ;(handlers[type] ??= []).push(handler)
    }),
    off: vi.fn((type: string, handler: () => void) => {
      handlers[type] = (handlers[type] ?? []).filter((h) => h !== handler)
    }),
    fire,
  }
}

async function tilesLoaded(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, GRAPH_DEBOUNCE_MS + 20))
  await flushPromises()
}

async function setUp(options: { tilesUrl?: string | null; readOnly?: boolean; initial?: LngLat[]; zoom?: number } = {}) {
  const coordinates = ref<LngLat[]>(options.initial ?? [])
  const setCoordinates = vi.fn((points: number[][]) => {
    coordinates.value = points.map(([lng, lat]) => [lng, lat])
  })
  let readOnly = options.readOnly ?? false
  const editor = useRouteEditor({
    coordinates,
    setCoordinates,
    readOnly: () => readOnly,
    tilesUrl: 'tilesUrl' in options ? options.tilesUrl : TILES,
  })
  const map = makeMap(options.zoom)
  editor.module.attach(map as unknown as MapLibreMap)
  await flushPromises()
  const draw = fakes.instances[fakes.instances.length - 1]
  await tilesLoaded()
  return { editor, map, draw, coordinates, setCoordinates, lock: () => { readOnly = true } }
}

// The adapter hands modes every pointer position cut to its precision.
function atPrecision(n: number): number {
  return Math.round(n * 1e9) / 1e9
}

// The hover guide is the rail graph's point at full float precision; what the
// editor keeps of it is that point cut to terra-draw's.
function onDraw(point: number[] | undefined): LngLat {
  return toDrawPrecision([point!])[0]
}

function click(draw: FakeDraw, [lng, lat]: LngLat, shift = false) {
  const line = draw.modes.linestring.options as {
    snapping: { toCustom: (event: unknown, context: unknown) => number[] | undefined }
    pointerEvents: { leftClick: (event: unknown) => boolean }
  }
  const event = { lng: atPrecision(lng), lat: atPrecision(lat), containerX: 0, containerY: 0, button: 'left', heldKeys: shift ? ['Shift'] : [], isContextMenu: false }
  const guide = line.snapping.toCustom(event, {})
  const allowed = line.pointerEvents.leftClick(event)
  return { guide, allowed }
}

// The hover guide alone, as a mouse move asks for it: no click lands.
function guideFor(draw: FakeDraw, [lng, lat]: LngLat, shift = false) {
  const line = draw.modes.linestring.options as { snapping: { toCustom: (event: unknown, context: unknown) => number[] | undefined } }
  return line.snapping.toCustom({ lng, lat, containerX: 0, containerY: 0, button: 'neither', heldKeys: shift ? ['Shift'] : [], isContextMenu: false }, {})
}

function routeFeature(draw: FakeDraw): Feature<LineString> | undefined {
  return draw.getSnapshot().find((f): f is Feature<LineString> => f.geometry.type === 'LineString')
}

function pointFeature(draw: FakeDraw): Feature<Point> | undefined {
  return draw.getSnapshot().find((f): f is Feature<Point> => f.geometry.type === 'Point')
}

// Known railway positions on the Fresno tiles (see railGraph.spec.ts): the
// BNSF main line either side of the 6391/6392 tile seam, and a spot a little
// way off the UP Fresno Subdivision.
// Each is taken at terra-draw's precision, as a click on it would arrive.
const bnsfNorth = onDraw(fresnoPoint(2740, 6391, 1443, 1411))
const bnsfSouth = onDraw(fresnoPoint(2740, 6392, 3064, 914))
const nearJunction = fresnoPoint(2740, 6392, 2275, 6)
const nowhere: LngLat = [-119.3, 36.4]

describe('useRouteEditor', () => {
  beforeEach(() => {
    fakes.instances.length = 0
    tileSources.length = 0
    tileFailures.remaining = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('setting up', () => {
    it('brings terra-draw up with its layers named for the stack, and loads the viewport tiles once near enough', async () => {
      const { draw, editor } = await setUp()
      expect(draw.enabled).toBe(true)
      expect((draw.adapter as { config: { prefixId: string } }).config.prefixId).toBe(ROUTE_EDITOR_PREFIX)
      expect(editor.railAvailable).toBe(true)
      expect(editor.mode.value).toBe('easy')
      expect(editor.loading.value).toBe(false)
      const requested = tileSources[0].requested
      for (const tile of ['14/2739/6391', '14/2739/6392', '14/2740/6391', '14/2740/6392']) expect(requested).toContain(tile)
    })

    it('asks for no tiles while the map is too far out, and loads them after a move brings it in', async () => {
      const { map } = await setUp({ zoom: 10 })
      expect(tileSources[0].requested).toEqual([])
      map.zoom = 13
      map.fire('moveend')
      await tilesLoaded()
      expect(tileSources[0].requested).toContain('14/2740/6392')
    })

    it('reports loading from the moment the map settles until the tiles are in', async () => {
      const { editor, map } = await setUp()
      expect(editor.loading.value).toBe(false)
      map.fire('moveend')
      expect(editor.loading.value).toBe(true)
      await tilesLoaded()
      expect(editor.loading.value).toBe(false)
    })

    it('is not loading while the map is too far out for tiles', async () => {
      const { editor, map } = await setUp({ zoom: 10 })
      map.fire('moveend')
      expect(editor.loading.value).toBe(false)
    })

    it('loads the railways on the next move after the first load failed', async () => {
      tileFailures.remaining = 1
      const { editor, draw, map } = await setUp()
      editor.start()
      expect(click(draw, nearJunction).guide).toBeUndefined()
      map.fire('moveend')
      await tilesLoaded()
      expect(guideFor(draw, nearJunction)).toBeDefined()
    })

    it('does nothing to a map it was detached from before terra-draw had loaded', async () => {
      const coordinates = ref<LngLat[]>([])
      const editor = useRouteEditor({ coordinates, setCoordinates: vi.fn(), readOnly: () => false, tilesUrl: TILES })
      const map = makeMap()
      editor.module.attach(map as unknown as MapLibreMap)
      editor.module.detach()
      await flushPromises()
      await tilesLoaded()
      expect(fakes.instances).toHaveLength(0)
      expect(tileSources).toHaveLength(0)
    })

    it('stops terra-draw and stops listening on detach', async () => {
      const { editor, map, draw } = await setUp()
      editor.module.detach()
      expect(draw.enabled).toBe(false)
      expect(map.off).toHaveBeenCalledWith('moveend', expect.any(Function))
      expect(editor.drawing.value).toBe(false)
    })

    it('shows a route the draft already has, and frames it as a static line in easy mode', async () => {
      const { draw } = await setUp({ initial: [bnsfNorth, bnsfSouth] })
      expect(routeFeature(draw)?.geometry.coordinates).toEqual([bnsfNorth, bnsfSouth])
      expect(routeFeature(draw)?.properties?.mode).toBe('linestring')
      expect(draw.mode).toBe('static')
    })
  })

  describe('easy mode', () => {
    it('snaps a click to the railway, refuses the click to terra-draw, and shows the first point as a point', async () => {
      const { editor, draw, coordinates, setCoordinates } = await setUp()
      editor.start()
      expect(editor.drawing.value).toBe(true)
      expect(draw.mode).toBe('linestring')

      const { guide, allowed } = click(draw, nearJunction)
      expect(allowed).toBe(false)
      expect(guide).toBeDefined()
      expect(coordinates.value).toHaveLength(1)
      expect(coordinates.value[0]).toEqual(onDraw(guide))
      expect(coordinates.value[0]).not.toEqual(nearJunction)
      expect(setCoordinates).toHaveBeenCalledTimes(1)
      expect(pointFeature(draw)?.geometry.coordinates).toEqual(onDraw(guide))
      expect(pointFeature(draw)?.properties?.mode).toBe('point')
      expect(routeFeature(draw)).toBeUndefined()
      expect(editor.lastSnap.value).toEqual({ kind: 'snapped', label: 'Snapped to BNSF Stockton Subdivision' })
    })

    it('fills in the railway between two clicks and records which way it followed', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      click(draw, bnsfSouth)

      const points = coordinates.value
      expect(points.length).toBeGreaterThan(2)
      expect(points[0]).toEqual(onDraw(guideFor(draw, bnsfNorth)))
      expect(points[points.length - 1]).toEqual(onDraw(guideFor(draw, bnsfSouth)))
      const graph = await RailGraph.load(fresnoTiles(), FRESNO_BBOX)
      for (const point of points) expect(graph.nearestPoint(point, 1)?.offsetM).toBeLessThan(0.01)
      for (let i = 1; i < points.length; i++) expect(points[i]).not.toEqual(points[i - 1])

      expect(routeFeature(draw)?.geometry.coordinates).toEqual(points)
      expect(pointFeature(draw)).toBeUndefined()
      expect(editor.spans.value).toHaveLength(1)
      expect(editor.spans.value[0]).toMatchObject({ from: 0, to: points.length - 1, provenance: { state: 'existing' } })
      expect((editor.spans.value[0].provenance as { wayId: number }).wayId).toBeGreaterThan(0)
      expect(editor.freeSpanCount.value).toBe(0)
      expect(editor.lastSnap.value?.kind).toBe('snapped')
    })

    // SPA-90: the rail graph's points carry full float precision, which
    // terra-draw refuses without a word, so a traced route was kept in the
    // draft but never reached the map.
    it('puts the traced route in terra-draw as a styled line on top of the map', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      expect(pointFeature(draw)?.properties?.mode).toBe('point')
      click(draw, nearJunction)
      click(draw, bnsfSouth)

      const route = routeFeature(draw)
      expect(route?.geometry.coordinates).toEqual(coordinates.value)
      expect(coordinates.value.length).toBeGreaterThan(2)
      expect(route?.properties?.mode).toBe('linestring')
      const styles = draw.modes.linestring.options.styles as { lineStringColor: string; lineStringWidth: number }
      expect(styles.lineStringColor).toBe(THEME_TOKEN_FALLBACKS['--color-coral'])
      expect(styles.lineStringWidth).toBeGreaterThan(ROUTE_LINE_WIDTH)
      const selected = draw.modes.select.options.styles as { selectedLineStringColor: string; selectedLineStringWidth: number }
      expect(selected.selectedLineStringColor).toBe(styles.lineStringColor)
      expect(selected.selectedLineStringWidth).toBe(styles.lineStringWidth)

      // Nothing sits above the editor's layers in the stack, so the adapter
      // adds them over every layer already on the map, the basemap's included.
      expect(layerStack().slice(-ROUTE_EDITOR_LAYER_IDS.length)).toEqual([...ROUTE_EDITOR_LAYER_IDS])
      const config = (draw.adapter as { config: { renderBelowLayerId?: string; coordinatePrecision?: number } }).config
      expect(config.renderBelowLayerId).toBeUndefined()
      expect(config.coordinatePrecision).toBe(9)
    })

    it('keeps its layers over every other, the basemap labels and the rail overlay added after it included', async () => {
      const { map } = await setUp()
      const editorLast = () => expect(map.layers.slice(-ROUTE_EDITOR_LAYER_IDS.length)).toEqual([...ROUTE_EDITOR_LAYER_IDS])
      editorLast()

      railOverlayModule(TILES).attach(map as unknown as MapLibreMap)
      await flushPromises()
      expect(map.layers).toContain(RAIL_EXISTING_LAYER_ID)
      expect(map.layers).toContain(RAIL_PROPOSED_LAYER_ID)
      editorLast()

      map.addLayer({ id: 'late-label' })
      editorLast()
      expect(map.layers.indexOf('late-label')).toBeLessThan(map.layers.indexOf(ROUTE_EDITOR_LAYER_IDS[0]))
      expect(map.layers.indexOf('place-label')).toBeLessThan(map.layers.indexOf(ROUTE_EDITOR_LAYER_IDS[0]))
    })

    it('draws a straight span, flagged, where there is no railway to follow', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      const { guide } = click(draw, nowhere)
      expect(guide).toBeUndefined()
      expect(coordinates.value).toHaveLength(2)
      expect(coordinates.value[1]).toEqual(nowhere)
      expect(editor.spans.value).toEqual([{ from: 0, to: 1, provenance: 'free' }])
      expect(editor.freeSpanCount.value).toBe(1)
      expect(editor.lastSnap.value).toEqual({ kind: 'free' })
    })

    it('takes no click off the railways while they are still loading, and snaps once they are in', async () => {
      const { editor, draw, map, coordinates } = await setUp({ zoom: 10 })
      editor.start()
      map.zoom = 14
      map.fire('moveend')
      expect(editor.loading.value).toBe(true)
      expect(click(draw, nearJunction).allowed).toBe(false)
      expect(coordinates.value).toEqual([])
      await tilesLoaded()
      const { guide } = click(draw, nearJunction)
      expect(guide).toBeDefined()
      expect(coordinates.value).toEqual([onDraw(guide)])
      expect(editor.lastSnap.value?.kind).toBe('snapped')
    })

    it('refuses a click while the map is too far out for railways, and asks to zoom in', async () => {
      const { editor, draw, coordinates } = await setUp({ zoom: 10 })
      editor.start()
      expect(click(draw, nearJunction).allowed).toBe(false)
      expect(coordinates.value).toEqual([])
      expect(editor.zoomedOut.value).toBe(true)
    })

    it('snaps as before once the map is close enough for railways', async () => {
      const { editor, draw, coordinates } = await setUp({ zoom: 13 })
      editor.start()
      const { guide } = click(draw, nearJunction)
      expect(guide).toBeDefined()
      expect(coordinates.value).toEqual([onDraw(guide)])
      expect(editor.zoomedOut.value).toBe(false)
      expect(editor.lastSnap.value).toEqual({ kind: 'snapped', label: 'Snapped to BNSF Stockton Subdivision' })
    })

    it('keeps terra-draw in its mode across the draft changes each click makes', async () => {
      const { editor, draw, map } = await setUp()
      editor.start()
      const setMode = vi.spyOn(draw, 'setMode')
      click(draw, bnsfNorth)
      editor.module.sync(map as unknown as MapLibreMap)
      click(draw, bnsfSouth)
      editor.module.sync(map as unknown as MapLibreMap)
      expect(setMode).not.toHaveBeenCalled()
      expect(draw.mode).toBe('linestring')
    })

    it('ignores a click on the point just placed', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      click(draw, bnsfNorth)
      expect(coordinates.value).toHaveLength(1)
    })

    it('keeps snapping with Shift held: free points are an advanced-mode gesture', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.start()
      const { guide } = click(draw, nearJunction, true)
      expect(guide).toBeDefined()
      expect(coordinates.value[0]).toEqual(onDraw(guide))
    })

    it('finishes on request and clicks no longer land', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      editor.finish()
      expect(editor.drawing.value).toBe(false)
      expect(draw.mode).toBe('static')
      click(draw, bnsfSouth)
      expect(coordinates.value).toHaveLength(1)
    })

    it('clears the shape', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      click(draw, bnsfSouth)
      editor.clear()
      expect(coordinates.value).toEqual([])
      expect(draw.getSnapshot()).toEqual([])
      expect(editor.spans.value).toEqual([])
      expect(editor.lastSnap.value).toBeNull()
    })
  })

  describe('advanced mode', () => {
    it('snaps a click but appends it straight, and Shift places the raw point', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.setMode('advanced')
      editor.start()
      const { guide } = click(draw, bnsfNorth)
      expect(guide).toBeDefined()
      expect(coordinates.value[0]).toEqual(onDraw(guide))
      expect(editor.lastSnap.value?.kind).toBe('snapped')

      const shifted = click(draw, bnsfSouth, true)
      expect(shifted.guide).toBeUndefined()
      expect(coordinates.value).toEqual([onDraw(guide), bnsfSouth])
      expect(editor.spans.value).toEqual([{ from: 0, to: 1, provenance: 'free' }])
      expect(editor.lastSnap.value).toEqual({ kind: 'free' })
    })

    it('takes clicks while the map is too far out for railways', async () => {
      const { editor, draw, coordinates } = await setUp({ zoom: 10 })
      editor.setMode('advanced')
      editor.start()
      click(draw, nowhere)
      expect(coordinates.value).toEqual([nowhere])
    })

    it('forgets a held Shift when the window loses focus, and stops listening on detach', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.setMode('advanced')
      editor.start()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))
      expect(click(draw, bnsfNorth).guide).toBeUndefined()
      window.dispatchEvent(new Event('blur'))
      const { guide } = click(draw, bnsfSouth)
      expect(guide).toBeDefined()
      expect(coordinates.value).toEqual([bnsfNorth, onDraw(guide)])

      const removed = vi.spyOn(window, 'removeEventListener')
      editor.module.detach()
      expect(removed).toHaveBeenCalledWith('blur', expect.any(Function))
    })

    it('does not fill in the railway between clicks', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.setMode('advanced')
      editor.start()
      click(draw, bnsfNorth)
      click(draw, bnsfSouth)
      expect(coordinates.value).toHaveLength(2)
    })

    it('hands the route to select mode with the handles on, and back to drawing on start', async () => {
      const { editor, draw } = await setUp({ initial: [bnsfNorth, bnsfSouth] })
      editor.setMode('advanced')
      await flushPromises()
      expect(draw.mode).toBe('select')
      expect(draw.selected).toBe(routeFeature(draw)?.id)
      expect(draw.modes.linestring.options.editable).toBe(true)
      const flags = draw.modes.select.options.flags as Record<string, { feature: { coordinates: Record<string, unknown> } }>
      expect(flags.linestring.feature.coordinates).toMatchObject({ midpoints: true, draggable: true, deletable: true })
      expect(flags.linestring.feature.coordinates.snappable).toEqual(draw.modes.linestring.options.snapping)

      editor.start()
      expect(draw.mode).toBe('linestring')
      editor.finish()
      expect(draw.mode).toBe('select')
    })

    it('reads an edit made with the handles back into the draft and forgets the provenance', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      click(draw, bnsfSouth)
      editor.finish()
      editor.setMode('advanced')
      await flushPromises()
      expect(editor.spans.value).toHaveLength(1)

      const route = routeFeature(draw)!
      const moved: LngLat[] = [bnsfNorth, nowhere, bnsfSouth]
      draw.store.get(route.id!)!.geometry = { type: 'LineString', coordinates: moved }
      draw.emit('finish', route.id, { mode: 'select', action: 'dragCoordinate' })

      expect(coordinates.value).toEqual(moved)
      expect(editor.spans.value).toEqual([])
    })

    it('keeps the shape across a mode switch either way', async () => {
      const { editor, draw, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      click(draw, bnsfSouth)
      const traced = coordinates.value
      editor.setMode('advanced')
      await flushPromises()
      expect(coordinates.value).toEqual(traced)
      expect(routeFeature(draw)?.geometry.coordinates).toEqual(traced)
      editor.setMode('easy')
      await flushPromises()
      expect(coordinates.value).toEqual(traced)
      expect(draw.mode).toBe('linestring')
    })
  })

  describe('the draft', () => {
    it('takes a shape set outside the editor, such as an import, and drops what it knew about spans', async () => {
      const { editor, draw, map, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      click(draw, nowhere)
      expect(editor.freeSpanCount.value).toBe(1)

      coordinates.value = [[-120, 36], [-120.5, 36.5], [-121, 37]]
      editor.module.sync(map as unknown as MapLibreMap)

      expect(routeFeature(draw)?.geometry.coordinates).toEqual([[-120, 36], [-120.5, 36.5], [-121, 37]])
      expect(editor.spans.value).toEqual([])
      expect(editor.freeSpanCount.value).toBe(0)
      expect(editor.lastSnap.value).toBeNull()

      click(draw, bnsfSouth)
      expect(coordinates.value).toHaveLength(4)
      expect(coordinates.value.slice(0, 3)).toEqual([[-120, 36], [-120.5, 36.5], [-121, 37]])
    })

    it('leaves the editor alone when the draft hands back what the editor just set', async () => {
      const { editor, draw, map, coordinates } = await setUp()
      editor.start()
      click(draw, bnsfNorth)
      click(draw, bnsfSouth)
      const before = editor.spans.value
      coordinates.value = coordinates.value.map(([lng, lat]) => [lng, lat])
      editor.module.sync(map as unknown as MapLibreMap)
      expect(editor.spans.value).toBe(before)
      expect(routeFeature(draw)?.geometry.coordinates).toEqual(coordinates.value)
    })
  })

  describe('a route that lines are built on', () => {
    it('shows the shape and takes no drawing', async () => {
      const { editor, draw, coordinates } = await setUp({ initial: [bnsfNorth, bnsfSouth], readOnly: true })
      expect(draw.mode).toBe('static')
      editor.start()
      expect(editor.drawing.value).toBe(false)
      expect(draw.mode).toBe('static')
      click(draw, nowhere)
      editor.clear()
      expect(coordinates.value).toEqual([bnsfNorth, bnsfSouth])
      editor.setMode('advanced')
      await flushPromises()
      expect(draw.mode).toBe('static')
    })

    it('stops drawing the moment the route turns out to be in use', async () => {
      const { editor, draw, map, lock } = await setUp()
      editor.start()
      expect(draw.mode).toBe('linestring')
      lock()
      editor.module.sync(map as unknown as MapLibreMap)
      expect(editor.drawing.value).toBe(false)
      expect(draw.mode).toBe('static')
    })
  })

  describe('without rail tiles', () => {
    it('starts in advanced mode, refuses easy, fetches nothing and places every click free', async () => {
      const { editor, draw, coordinates } = await setUp({ tilesUrl: null })
      expect(editor.railAvailable).toBe(false)
      expect(editor.mode.value).toBe('advanced')
      editor.setMode('easy')
      expect(editor.mode.value).toBe('advanced')
      expect(tileSources).toHaveLength(0)
      editor.start()
      const { guide } = click(draw, bnsfNorth)
      expect(guide).toBeUndefined()
      expect(coordinates.value).toEqual([bnsfNorth])
      expect(editor.lastSnap.value).toEqual({ kind: 'free' })
    })

    it('reads the tiles URL from the build when none is given', () => {
      const editor = useRouteEditor({ coordinates: ref([]), setCoordinates: vi.fn(), readOnly: () => false })
      expect(editor.railAvailable).toBe(false)
    })
  })
})

describe('snapLabel', () => {
  it('names the railway, or its state when it has no name', () => {
    expect(snapLabel({ name: 'UP Fresno Subdivision', state: 'existing' })).toBe('Snapped to UP Fresno Subdivision')
    expect(snapLabel({ state: 'existing' })).toBe('Snapped to a railway')
    expect(snapLabel({ state: 'construction' })).toBe('Snapped to a railway under construction')
    expect(snapLabel({ state: 'proposed' })).toBe('Snapped to a proposed railway')
  })
})

describe('viewportBbox', () => {
  it('grows the viewport by the margin on every side, within the world', () => {
    const map = { getBounds: () => ({ getWest: () => -120, getSouth: () => 36, getEast: () => -119, getNorth: () => 37 }) }
    expect(viewportBbox(map as unknown as MapLibreMap, 0.2)).toEqual([-120.2, 35.8, -118.8, 37.2])
    const edge = { getBounds: () => ({ getWest: () => -179.9, getSouth: () => 84.9, getEast: () => 179.9, getNorth: () => 85 }) }
    expect(viewportBbox(edge as unknown as MapLibreMap, 0.5).map((v) => Number(v.toFixed(6)))).toEqual([-180, 84.85, 180, 85])
  })
})
