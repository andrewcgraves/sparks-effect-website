import { computed, ref, watch, type Ref } from 'vue'
import type { Map } from 'maplibre-gl'
import type { GeoJSONStoreFeatures, HexColor, TerraDraw, TerraDrawLineStringMode, TerraDrawMouseEvent } from 'terra-draw'
import type { Position } from 'geojson'
import type { MapModule } from './mapLifecycle'
import { layerAboveInStack } from './layerStack'
import { ROUTE_EDITOR_LAYER_IDS, ROUTE_EDITOR_PREFIX } from './railLayerIds'
import { chainageAlong } from '../chainage'
import { RailGraph } from '../rail/railGraph'
import type { Bbox, LngLat, RailHit, RailState, RailTileSource } from '../rail/railGraph'
import { metresPerPixel } from '../rail/tileMath'
import { railTilesUrl } from '../railTilesUrl'
import { dropRepeatedPoints } from '../routeGeometry'
import { THEME_TOKEN_FALLBACKS, readThemeToken, type ThemeTokenName } from '../themeTokens'

export type EditorMode = 'easy' | 'advanced'

export interface RailSpan {
  wayId: number
  name?: string
  state: RailState
}

export type SpanProvenance = RailSpan | 'free'

export interface RouteSpan {
  from: number
  to: number
  provenance: SpanProvenance
}

export type SnapNote = { kind: 'snapped'; label: string } | { kind: 'free' }

export interface RouteEditorOptions {
  coordinates: Ref<LngLat[]>
  setCoordinates: (points: LngLat[]) => void
  readOnly: () => boolean
  tilesUrl?: string | null
}

export { ROUTE_EDITOR_LAYER_IDS, ROUTE_EDITOR_PREFIX } from './railLayerIds'
export const LINE_MODE = 'linestring'
export const POINT_MODE = 'point'
export const SELECT_MODE = 'select'
export const STATIC_MODE = 'static'

export const SNAP_RADIUS_PX = 30
export const GRAPH_MIN_ZOOM = 12
export const GRAPH_MARGIN = 0.2
export const GRAPH_DEBOUNCE_MS = 250
export const WALK_MIN_BUDGET_M = 500
export const WALK_BUDGET_FACTOR = 3
export const COORDINATE_PRECISION = 9
// Over the route map's line width, and in the accent of the primary action:
// the route being drawn is the strongest stroke on the map, over every
// railway it follows.
export const DRAWN_ROUTE_WIDTH = 3
// MapLibre's zoom counts 512 px tiles, whatever the vector tiles' extent is.
const SCREEN_TILE_PX = 512
const MAX_LAT = 85

export function snapLabel(hit: Pick<RailHit, 'name' | 'state'>): string {
  if (hit.name) return `Snapped to ${hit.name}`
  switch (hit.state) {
    case 'construction':
      return 'Snapped to a railway under construction'
    case 'proposed':
      return 'Snapped to a proposed railway'
    default:
      return 'Snapped to a railway'
  }
}

export function viewportBbox(map: Pick<Map, 'getBounds'>, margin: number): Bbox {
  const bounds = map.getBounds()
  const w = bounds.getWest()
  const s = bounds.getSouth()
  const e = bounds.getEast()
  const n = bounds.getNorth()
  const dx = (e - w) * margin
  const dy = (n - s) * margin
  return [
    Math.max(-180, w - dx),
    Math.max(-MAX_LAT, s - dy),
    Math.min(180, e + dx),
    Math.min(MAX_LAT, n + dy),
  ]
}

function samePoint(a: LngLat, b: LngLat): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

function sameCoordinates(a: LngLat[], b: LngLat[]): boolean {
  return a.length === b.length && a.every((p, i) => samePoint(p, b[i]))
}

function roundTo(value: number, factor: number): number {
  return Math.round(value * factor) / factor
}

// terra-draw refuses, without a word, any feature with a coordinate finer
// than the adapter's precision (addFeatures only returns valid: false), and
// a point the rail graph hands out is a tile vertex interpolated to full
// float precision, so every point is cut to that precision before it is kept.
export function toDrawPrecision(points: number[][]): LngLat[] {
  const factor = 10 ** COORDINATE_PRECISION
  return points.map(([lng, lat]) => [roundTo(lng, factor), roundTo(lat, factor)])
}

// The adapter appends its layers once, when terra-draw starts, so anything
// added after that (the rail overlay once its tiles protocol is in, a late
// basemap label) would paint over the route. Moving each of ours to the top
// in turn keeps their own order; already on top is a no-op, which also ends
// the styledata that moveLayer itself raises.
export function raiseEditorLayers(map: Pick<Map, 'getLayersOrder' | 'moveLayer'>): void {
  const order = map.getLayersOrder()
  const ours = order.filter((id) => id.startsWith(`${ROUTE_EDITOR_PREFIX}-`))
  const tail = order.slice(order.length - ours.length)
  if (tail.every((id, i) => id === ours[i])) return
  for (const id of ours) map.moveLayer(id)
}

function hexToken(name: ThemeTokenName): HexColor {
  const value = readThemeToken(name)
  return (/^#[0-9a-f]{3,8}$/i.test(value) ? value : THEME_TOKEN_FALLBACKS[name]) as HexColor
}

export function useRouteEditor(options: RouteEditorOptions) {
  const tilesUrl = options.tilesUrl === undefined ? railTilesUrl() : options.tilesUrl
  const railAvailable = tilesUrl !== null
  const mode = ref<EditorMode>(railAvailable ? 'easy' : 'advanced')
  const drawing = ref(false)
  const loading = ref(false)
  const zoomedOut = ref(false)
  const lastSnap = ref<SnapNote | null>(null)
  const spans = ref<RouteSpan[]>([])
  const freeSpanCount = computed(() => spans.value.filter((span) => span.provenance === 'free').length)

  let map: Map | null = null
  let draw: TerraDraw | null = null
  let routeId: string | number | null = null
  let pointId: string | number | null = null
  let points: LngLat[] = []
  let shiftHeld = false
  // Bumped on every attach and detach: the terra-draw import and every tile
  // load are async, and one that lands after the map has gone must do nothing.
  let generation = 0
  let source: RailTileSource | null = null
  let graph: RailGraph | null = null
  let graphLoad: Promise<RailGraph> | null = null
  let loadsInFlight = 0
  let pendingLoad: ReturnType<typeof setTimeout> | null = null
  // True while this module rewrites the feature itself, so terra-draw's own
  // finish events for those rewrites are not read back as the author's edits.
  let applying = false

  function snapRadiusM(lat: number): number {
    return SNAP_RADIUS_PX * metresPerPixel(lat, map?.getZoom() ?? GRAPH_MIN_ZOOM, SCREEN_TILE_PX)
  }

  function hitFor(event: Pick<TerraDrawMouseEvent, 'lng' | 'lat' | 'heldKeys'>): RailHit | null {
    if (!graph) return null
    if (mode.value === 'advanced' && (shiftHeld || event.heldKeys.includes('Shift'))) return null
    return graph.nearestPoint([event.lng, event.lat], snapRadiusM(event.lat))
  }

  // terra-draw's snapping callback: the hover guide follows the railway, and
  // the click lands where the guide is.
  function toCustom(event: TerraDrawMouseEvent): Position | undefined {
    return hitFor(event)?.point
  }

  // The click is taken here and refused to terra-draw: its line-string mode
  // can only start a line of its own, and rewriting a line it is drawing
  // resets its drawing state (afterFeatureUpdated, terra-draw 1.37), so the
  // route is a committed feature this module appends to instead.
  function captureClick(event: TerraDrawMouseEvent): boolean {
    if (!drawing.value) return false
    // Too far out for the railways to load: an easy-mode click would only
    // ever be drawn straight, so it is refused until the author zooms in.
    if (mode.value === 'easy' && map && map.getZoom() < GRAPH_MIN_ZOOM) {
      zoomedOut.value = true
      return false
    }
    const hit = hitFor(event)
    // Railways still arriving: a click on one would read as "no railway
    // here" and be drawn straight, so in easy mode it is not taken yet.
    if (!hit && mode.value === 'easy' && loading.value) return false
    commitClick(toDrawPrecision([hit ? hit.point : [event.lng, event.lat]])[0], hit)
    return false
  }

  function commitClick(clicked: LngLat, hit: RailHit | null): void {
    const previous = points[points.length - 1]
    if (previous && samePoint(previous, clicked)) return
    if (!previous) {
      points = [clicked]
      lastSnap.value = hit ? { kind: 'snapped', label: snapLabel(hit) } : { kind: 'free' }
      render()
      pushToDraft()
      return
    }
    let added: LngLat[] = [clicked]
    let provenance: SpanProvenance = 'free'
    if (mode.value === 'easy' && hit && graph) {
      // Three times the straight run, and never under half a kilometre: a
      // railway bending round a hill is still the one the author meant, and
      // a walk that cannot be done in that leaves a straight span, flagged.
      const straight = chainageAlong([previous, clicked])[1]
      const path = graph.walk(previous, clicked, Math.max(WALK_MIN_BUDGET_M, WALK_BUDGET_FACTOR * straight))
      if (path) {
        added = toDrawPrecision(path.slice(1))
        provenance = { wayId: hit.wayId, name: hit.name, state: hit.state }
      }
    }
    const from = points.length - 1
    points = dropRepeatedPoints([...points, ...added])
    spans.value = [...spans.value, { from, to: points.length - 1, provenance }]
    lastSnap.value = provenance === 'free'
      ? hit && mode.value === 'advanced' ? { kind: 'snapped', label: snapLabel(hit) } : { kind: 'free' }
      : { kind: 'snapped', label: snapLabel(hit!) }
    render()
    pushToDraft()
  }

  function lineFeature(id: string | number): GeoJSONStoreFeatures {
    return {
      id,
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: points },
      properties: { mode: LINE_MODE },
    }
  }

  function render(): void {
    if (!draw) return
    applying = true
    try {
      if (pointId !== null && draw.hasFeature(pointId)) draw.removeFeatures([pointId])
      pointId = null
      if (points.length >= 2) {
        if (routeId !== null && draw.hasFeature(routeId)) {
          draw.updateFeatureGeometry(routeId, { type: 'LineString', coordinates: points })
        } else {
          routeId = draw.getFeatureId()
          draw.addFeatures([lineFeature(routeId)])
          if (draw.getMode() === SELECT_MODE) draw.selectFeature(routeId)
        }
        return
      }
      if (routeId !== null && draw.hasFeature(routeId)) draw.removeFeatures([routeId])
      routeId = null
      // A route of one point is not yet a line terra-draw will hold, so the
      // first click is shown as a point until the second makes a line of it.
      if (points.length === 1) {
        pointId = draw.getFeatureId()
        draw.addFeatures([{
          id: pointId,
          type: 'Feature',
          geometry: { type: 'Point', coordinates: points[0] },
          properties: { mode: POINT_MODE },
        }])
      }
    } finally {
      applying = false
    }
  }

  function pushToDraft(): void {
    options.setCoordinates(points)
  }

  function adopt(coordinates: number[][]): void {
    points = dropRepeatedPoints(toDrawPrecision(coordinates))
    spans.value = []
    lastSnap.value = null
    render()
  }

  function syncFromDraft(): void {
    const external = options.coordinates.value
    if (sameCoordinates(toDrawPrecision(external), points)) return
    adopt(external)
  }

  // An edit made with terra-draw's own handles: a point dragged, a midpoint
  // pulled out, a point deleted. The provenance recorded per click cannot
  // follow indices that moved, so it is dropped rather than left wrong.
  function syncFromDraw(): void {
    if (!draw || routeId === null) return
    const feature = draw.getSnapshotFeature(routeId)
    if (!feature || feature.geometry.type !== 'LineString') return
    points = dropRepeatedPoints(toDrawPrecision(feature.geometry.coordinates))
    spans.value = []
    lastSnap.value = null
    pushToDraft()
  }

  function onFinish(id: string | number): void {
    if (applying || id !== routeId) return
    syncFromDraw()
  }

  function applyMode(): void {
    if (!draw) return
    draw.updateModeOptions<typeof TerraDrawLineStringMode>(LINE_MODE, { editable: mode.value === 'advanced' })
    if (options.readOnly()) {
      drawing.value = false
      enterMode(STATIC_MODE)
      return
    }
    if (drawing.value) {
      enterMode(LINE_MODE)
      return
    }
    if (mode.value === 'advanced') {
      if (enterMode(SELECT_MODE) && routeId !== null && draw.hasFeature(routeId)) draw.selectFeature(routeId)
    } else {
      enterMode(STATIC_MODE)
    }
  }

  // terra-draw's setMode stops and restarts a mode even when it is the one
  // running, which drops the hover guide and the selection, and applyMode
  // runs on every draft change, so each click and drag would do that.
  function enterMode(name: string): boolean {
    if (!draw || draw.getMode() === name) return false
    draw.setMode(name)
    return true
  }

  function setMode(next: EditorMode): void {
    if (next === 'easy' && !railAvailable) return
    mode.value = next
  }

  function start(): void {
    if (options.readOnly()) return
    drawing.value = true
    applyMode()
  }

  function finish(): void {
    drawing.value = false
    applyMode()
  }

  function clear(): void {
    if (options.readOnly()) return
    points = []
    spans.value = []
    lastSnap.value = null
    render()
    pushToDraft()
  }

  function onKey(event: KeyboardEvent): void {
    // The adapter only hears keys while the canvas has focus, and Shift is
    // pressed with the pointer on the map and the focus wherever it was.
    shiftHeld = event.shiftKey
  }

  // A keyup that lands while another window has focus never arrives.
  function onBlur(): void {
    shiftHeld = false
  }

  function scheduleGraphLoad(delayMs: number): void {
    if (!map || !source || map.getZoom() < GRAPH_MIN_ZOOM) return
    if (pendingLoad) clearTimeout(pendingLoad)
    // Loading from the moment the map settles, not from the fetch: the author
    // is already clicking, and the wait they see is the whole of it.
    loading.value = true
    pendingLoad = setTimeout(() => {
      pendingLoad = null
      void loadViewport()
    }, delayMs)
  }

  function onStyleData(): void {
    if (map && draw) raiseEditorLayers(map)
  }

  function onMoveEnd(): void {
    zoomedOut.value = map !== null && map.getZoom() < GRAPH_MIN_ZOOM
    scheduleGraphLoad(GRAPH_DEBOUNCE_MS)
  }

  // Tiles are fetched for the viewport and a margin round it, only once the
  // map is close enough for z14 tiles to be few: below that zoom a click
  // cannot pick one railway from the next anyway. Every tile is kept for the
  // session, so panning back costs nothing.
  async function loadViewport(): Promise<void> {
    if (!map || !source) return
    const mine = generation
    const bbox = viewportBbox(map, GRAPH_MARGIN)
    loadsInFlight++
    const load = graphLoad
    try {
      if (!load) {
        const first = RailGraph.load(source, bbox)
        graphLoad = first
        const loaded = await first
        if (mine === generation) graph = loaded
      } else {
        await (await load).extend(source, bbox)
      }
    } catch {
      // A tile that failed leaves snapping as it was; the next move retries.
      // A first load that failed is forgotten, or every later extend would
      // await its rejection and the graph would never come.
      if (!load && mine === generation && graph === null) graphLoad = null
    } finally {
      loadsInFlight--
      if (mine === generation && loadsInFlight === 0 && pendingLoad === null) loading.value = false
    }
  }

  async function setUp(target: Map, mine: number): Promise<void> {
    const [terraDraw, adapter] = await Promise.all([import('terra-draw'), import('terra-draw-maplibre-gl-adapter')])
    if (mine !== generation) return
    const ink = hexToken('--color-ink')
    const accent = hexToken('--color-coral')
    const white: HexColor = '#ffffff'
    const snapping = { toCustom }
    draw = new terraDraw.TerraDraw({
      adapter: new adapter.TerraDrawMapLibreGLAdapter({
        map: target,
        prefixId: ROUTE_EDITOR_PREFIX,
        coordinatePrecision: COORDINATE_PRECISION,
        renderBelowLayerId: layerAboveInStack(target, ROUTE_EDITOR_LAYER_IDS[ROUTE_EDITOR_LAYER_IDS.length - 1]),
      }),
      modes: [
        new terraDraw.TerraDrawLineStringMode({
          snapping,
          keyEvents: null,
          editable: mode.value === 'advanced',
          pointerEvents: {
            leftClick: captureClick,
            rightClick: false,
            contextMenu: false,
            onDragStart: true,
            onDrag: true,
            onDragEnd: true,
          },
          styles: {
            lineStringColor: accent,
            lineStringWidth: DRAWN_ROUTE_WIDTH,
            snappingPointColor: ink,
            snappingPointWidth: 6,
            snappingPointOutlineColor: white,
            snappingPointOutlineWidth: 2,
            coordinatePointColor: white,
            coordinatePointWidth: 5,
            coordinatePointOutlineColor: ink,
            coordinatePointOutlineWidth: 2,
          },
        }),
        new terraDraw.TerraDrawPointMode({
          styles: { pointColor: white, pointWidth: 5, pointOutlineColor: ink, pointOutlineWidth: 2 },
        }),
        new terraDraw.TerraDrawSelectMode({
          keyEvents: null,
          allowManualDeselection: false,
          flags: {
            [LINE_MODE]: {
              feature: {
                draggable: false,
                coordinates: { midpoints: true, draggable: true, deletable: true, snappable: snapping },
              },
            },
          },
          styles: {
            selectedLineStringColor: accent,
            selectedLineStringWidth: DRAWN_ROUTE_WIDTH,
            selectionPointColor: white,
            selectionPointWidth: 5,
            selectionPointOutlineColor: ink,
            selectionPointOutlineWidth: 2,
            midPointColor: white,
            midPointWidth: 4,
            midPointOutlineColor: ink,
            midPointOutlineWidth: 1.5,
          },
        }),
      ],
    })
    draw.on('finish', onFinish)
    draw.start()
    raiseEditorLayers(target)
    adopt(options.coordinates.value)
    applyMode()
    if (!tilesUrl) return
    const { pmtilesSource } = await import('../rail/pmtilesSource')
    if (mine !== generation) return
    source = pmtilesSource(tilesUrl)
    scheduleGraphLoad(0)
  }

  const module: MapModule = {
    deps: () => [options.coordinates.value, options.readOnly()],
    isReady: (styleLoaded) => styleLoaded,
    attach: (target) => {
      map = target
      zoomedOut.value = target.getZoom() < GRAPH_MIN_ZOOM
      target.on('moveend', onMoveEnd)
      target.on('styledata', onStyleData)
      window.addEventListener('keydown', onKey)
      window.addEventListener('keyup', onKey)
      window.addEventListener('blur', onBlur)
      void setUp(target, ++generation)
    },
    sync: () => {
      syncFromDraft()
      applyMode()
    },
    detach: () => {
      generation++
      if (pendingLoad) clearTimeout(pendingLoad)
      pendingLoad = null
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
      map?.off('moveend', onMoveEnd)
      map?.off('styledata', onStyleData)
      draw?.off('finish', onFinish)
      // stop() takes the adapter's layers and sources off the map.
      draw?.stop()
      draw = null
      map = null
      routeId = null
      pointId = null
      source = null
      graph = null
      graphLoad = null
      drawing.value = false
      loading.value = false
      zoomedOut.value = false
    },
  }

  watch(mode, applyMode)

  return {
    module,
    mode,
    setMode,
    railAvailable,
    drawing,
    loading,
    zoomedOut,
    lastSnap,
    spans,
    freeSpanCount,
    start,
    finish,
    clear,
  }
}
