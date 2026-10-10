import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { lngLatToPixel, metresPerPixel, pixelToLngLat, tileRange } from './tileMath'
import type { Bbox, LngLat } from './tileMath'

export type { Bbox, LngLat } from './tileMath'

export type RailState = 'existing' | 'construction' | 'proposed'

export interface RailTileSource {
  tile(z: number, x: number, y: number): Promise<Uint8Array | null>
}

export interface RailHit {
  point: LngLat
  offsetM: number
  wayId: number
  name?: string
  state: RailState
  maxspeed?: string
}

export function railState(props: Record<string, unknown>): RailState {
  switch (props.railway) {
    case 'proposed':
      return 'proposed'
    case 'construction':
      return 'construction'
    default:
      return 'existing'
  }
}

interface Way {
  wayId: number
  name?: string
  state: RailState
  maxspeed?: string
}

interface EdgePoint {
  edge: number
  fraction: number
  offsetPx: number
}

const LAYER = 'rail'
const DEFAULT_ZOOM = 14
const DEFAULT_EXTENT = 4096
const GRID_CELL_PX = 256
const BOUNDARY_MERGE_PX = 2
const ON_GRAPH_TOLERANCE_M = 1
const COINCIDENT_PX = 1e-6
const LINK_RADIUS_M = 8
const LINK_MAX_ANGLE_DEG = 20
const LINK_ENDPOINT_M = 2
const LINK_WAY = -1

export class RailGraph {
  readonly zoom: number
  private extent = DEFAULT_EXTENT
  private extentKnown = false
  private readonly nodeX: number[] = []
  private readonly nodeY: number[] = []
  private readonly nodeSynthetic: boolean[] = []
  private readonly nodeByKey = new Map<string, number>()
  private readonly boundaryNodes = new Map<string, number[]>()
  private readonly adjacency: number[][] = []
  private readonly edgeA: number[] = []
  private readonly edgeB: number[] = []
  private readonly edgeWay: number[] = []
  private readonly edgeLengthM: number[] = []
  private readonly edgeKeys = new Set<string>()
  private readonly ways: Way[] = []
  private readonly wayIndex = new Map<number, number>()
  private readonly grid = new Map<string, number[]>()
  private readonly loadedTiles = new Set<string>()
  private readonly linkedWays = new Map<number, Set<number>>()
  private links = 0

  private constructor(zoom: number) {
    this.zoom = zoom
  }

  static async load(source: RailTileSource, bbox: Bbox, zoom = DEFAULT_ZOOM): Promise<RailGraph> {
    const graph = new RailGraph(zoom)
    await graph.extend(source, bbox)
    return graph
  }

  get nodeCount(): number {
    return this.nodeX.length
  }

  get edgeCount(): number {
    return this.edgeA.length - this.links
  }

  get linkCount(): number {
    return this.links
  }

  async extend(source: RailTileSource, bbox: Bbox): Promise<void> {
    const { x0, y0, x1, y1 } = tileRange(bbox, this.zoom)
    const wanted: [number, number][] = []
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (!this.loadedTiles.has(`${x}/${y}`)) wanted.push([x, y])
      }
    }
    const tiles = await Promise.all(wanted.map(([x, y]) => source.tile(this.zoom, x, y)))
    // Adding a tile is idempotent (every node and edge is keyed), so two
    // overlapping extend() calls racing on the same tile cost time, not
    // correctness; tiles are marked loaded only once their edges are in.
    let added = false
    tiles.forEach((data, i) => {
      const [x, y] = wanted[i]
      if (data) {
        this.addTile(x, y, data)
        added = true
      }
      this.loadedTiles.add(`${x}/${y}`)
    })
    if (added) this.linkParallelTracks()
  }

  nearestPoint(p: LngLat, maxOffsetM: number): RailHit | null {
    return this.nearestPoints(p, maxOffsetM, 1)[0] ?? null
  }

  nearestPoints(p: LngLat, maxOffsetM: number, limit: number): RailHit[] {
    const [px, py] = lngLatToPixel(p, this.zoom, this.extent)
    const scale = metresPerPixel(p[1], this.zoom, this.extent)
    // One hit per way: the two tracks of a double-track railway are two ways,
    // and the edges either side of a vertex on the nearer one would otherwise
    // crowd the farther one out.
    const bestByWay = new Map<number, { point: EdgePoint; order: number }>()
    let order = 0
    for (const candidate of this.edgePointsNear(px, py, maxOffsetM / scale)) {
      order++
      const way = this.edgeWay[candidate.edge]
      const best = bestByWay.get(way)
      // Ties keep the earlier edge, as projectOntoAlignment keeps the earlier
      // leg: a point abeam a junction projects onto every edge meeting there.
      if (best && candidate.offsetPx >= best.point.offsetPx) continue
      bestByWay.set(way, { point: candidate, order })
    }
    return [...bestByWay.values()]
      .sort((a, b) => a.point.offsetPx - b.point.offsetPx || a.order - b.order)
      .slice(0, limit)
      .map(({ point }) => {
        const way = this.ways[this.edgeWay[point.edge]]
        return {
          point: pixelToLngLat(this.pointOnEdge(point.edge, point.fraction), this.zoom, this.extent),
          offsetM: point.offsetPx * scale,
          wayId: way.wayId,
          name: way.name,
          state: way.state,
          maxspeed: way.maxspeed,
        }
      })
  }

  walk(a: LngLat, b: LngLat, maxLengthM: number): LngLat[] | null {
    const starts = this.locate(a)
    const ends = this.locate(b)
    if (starts.length === 0 || ends.length === 0) return null

    let best = Infinity
    let bestNode = -1
    // Both points on one edge: the straight run between them is the shortest
    // path there can be, and Dijkstra would only ever find it by way of one
    // of the edge's ends.
    for (const s of starts) {
      for (const e of ends) {
        if (s.edge !== e.edge) continue
        best = Math.min(best, Math.abs(s.fraction - e.fraction) * this.edgeLengthM[s.edge])
      }
    }

    const arrival = new Map<number, number>()
    for (const e of ends) {
      const len = this.edgeLengthM[e.edge]
      this.offerArrival(arrival, this.edgeA[e.edge], e.fraction * len)
      this.offerArrival(arrival, this.edgeB[e.edge], (1 - e.fraction) * len)
    }

    const dist = new Map<number, number>()
    const prev = new Map<number, number>()
    const heap = new MinHeap()
    for (const s of starts) {
      const len = this.edgeLengthM[s.edge]
      this.relax(dist, heap, this.edgeA[s.edge], s.fraction * len)
      this.relax(dist, heap, this.edgeB[s.edge], (1 - s.fraction) * len)
    }
    for (let next = heap.pop(); next; next = heap.pop()) {
      const [d, u] = next
      if (d > dist.get(u)!) continue
      // Every path still open costs at least d, so nothing can beat what is
      // already found, or fit the budget, once d passes either.
      if (d >= best || d > maxLengthM) break
      const toEnd = arrival.get(u)
      if (toEnd !== undefined && d + toEnd < best) {
        best = d + toEnd
        bestNode = u
      }
      for (const edge of this.adjacency[u]) {
        const v = this.edgeA[edge] === u ? this.edgeB[edge] : this.edgeA[edge]
        if (this.relax(dist, heap, v, d + this.edgeLengthM[edge])) prev.set(v, u)
      }
    }
    if (best > maxLengthM) return null

    const nodes: number[] = []
    for (let n = bestNode; n !== -1; n = prev.get(n) ?? -1) nodes.push(n)
    nodes.reverse()
    return this.coordinates(a, nodes, b)
  }

  private addTile(x: number, y: number, data: Uint8Array): void {
    const layer = new VectorTile(new PbfReader(data)).layers[LAYER]
    if (!layer) return
    if (this.extentKnown && layer.extent !== this.extent) {
      throw new Error(`rail tile ${x}/${y} has extent ${layer.extent}, graph is built at ${this.extent}`)
    }
    this.extent = layer.extent
    this.extentKnown = true
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      if (feature.type !== 2 || feature.id === undefined) continue
      const way = this.wayFor(feature.id, feature.properties)
      for (const part of feature.loadGeometry()) {
        for (let j = 1; j < part.length; j++) {
          this.addSegment(x, y, way, part[j - 1].x, part[j - 1].y, part[j].x, part[j].y)
        }
      }
    }
  }

  private addSegment(tileX: number, tileY: number, way: number, ax: number, ay: number, bx: number, by: number): void {
    // Each tile contributes only what lies inside its own square. The buffer
    // beyond it repeats the neighbour's geometry, and a way that runs more
    // than a buffer's width past the edge is cut there to a synthetic point
    // that matches nothing on the other side. Cutting at the square's edge
    // instead gives both tiles the same crossing point to meet at.
    const span = clipToSquare(ax, ay, bx, by, this.extent)
    if (!span) return
    const [t0, t1] = span
    const dx = bx - ax
    const dy = by - ay
    const x0 = tileX * this.extent + ax + t0 * dx
    const y0 = tileY * this.extent + ay + t0 * dy
    const x1 = tileX * this.extent + ax + t1 * dx
    const y1 = tileY * this.extent + ay + t1 * dy
    // A way that only touches the square — a vertex on its edge with the way
    // leaving from there, or a pass through a corner — has nothing inside it.
    // A vertex and a crossing at one spot are different nodes, so the check is
    // on the points, before either node exists.
    if (Math.hypot(x1 - x0, y1 - y0) < COINCIDENT_PX) return
    const nodeA = t0 === 0 ? this.vertexNode(x0, y0) : this.boundaryNode(way, x0, y0)
    const nodeB = t1 === 1 ? this.vertexNode(x1, y1) : this.boundaryNode(way, x1, y1)
    if (nodeA === nodeB) return
    this.addEdge(way, nodeA, nodeB)
  }

  private vertexNode(gx: number, gy: number): number {
    const key = `${gx},${gy}`
    const existing = this.nodeByKey.get(key)
    if (existing !== undefined) return existing
    const id = this.newNode(gx, gy, false)
    this.nodeByKey.set(key, id)
    return id
  }

  private boundaryNode(way: number, gx: number, gy: number): number {
    // The two tiles compute this crossing from differently rounded pieces of
    // the same way, so it lands within a pixel or so of itself; a corner
    // crossing is on two lines, and is filed under both.
    const lines: string[] = []
    if (Math.abs(gx / this.extent - Math.round(gx / this.extent)) < 1e-9) lines.push(`v${Math.round(gx / this.extent)}`)
    if (Math.abs(gy / this.extent - Math.round(gy / this.extent)) < 1e-9) lines.push(`h${Math.round(gy / this.extent)}`)
    const keys = lines.map((line) => `${way}|${line}`)
    for (const key of keys) {
      for (const id of this.boundaryNodes.get(key) ?? []) {
        if (Math.hypot(this.nodeX[id] - gx, this.nodeY[id] - gy) <= BOUNDARY_MERGE_PX) return id
      }
    }
    const id = this.newNode(gx, gy, true)
    for (const key of keys) {
      const ids = this.boundaryNodes.get(key)
      if (ids) ids.push(id)
      else this.boundaryNodes.set(key, [id])
    }
    return id
  }

  private newNode(gx: number, gy: number, synthetic: boolean): number {
    this.nodeX.push(gx)
    this.nodeY.push(gy)
    this.nodeSynthetic.push(synthetic)
    this.adjacency.push([])
    return this.nodeX.length - 1
  }

  private addEdge(way: number, a: number, b: number): void {
    const key = a < b ? `${way}:${a}:${b}` : `${way}:${b}:${a}`
    if (this.edgeKeys.has(key)) return
    this.edgeKeys.add(key)
    const id = this.edgeA.length
    this.edgeA.push(a)
    this.edgeB.push(b)
    this.edgeWay.push(way)
    const midLat = pixelToLngLat([(this.nodeX[a] + this.nodeX[b]) / 2, (this.nodeY[a] + this.nodeY[b]) / 2], this.zoom, this.extent)[1]
    this.edgeLengthM.push(
      Math.hypot(this.nodeX[b] - this.nodeX[a], this.nodeY[b] - this.nodeY[a]) * metresPerPixel(midLat, this.zoom, this.extent),
    )
    this.adjacency[a].push(id)
    this.adjacency[b].push(id)
    this.index(id)
  }

  private index(edge: number): void {
    const a = this.edgeA[edge]
    const b = this.edgeB[edge]
    const cx0 = Math.floor(Math.min(this.nodeX[a], this.nodeX[b]) / GRID_CELL_PX)
    const cx1 = Math.floor(Math.max(this.nodeX[a], this.nodeX[b]) / GRID_CELL_PX)
    const cy0 = Math.floor(Math.min(this.nodeY[a], this.nodeY[b]) / GRID_CELL_PX)
    const cy1 = Math.floor(Math.max(this.nodeY[a], this.nodeY[b]) / GRID_CELL_PX)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = `${cx},${cy}`
        const edges = this.grid.get(cell)
        if (edges) edges.push(edge)
        else this.grid.set(cell, [edge])
      }
    }
  }

  private linkParallelTracks(): void {
    // OSM draws each track of a double-track railway as its own way, a few
    // metres from the other and joined only at the crossovers, so a walk
    // between points on the two tracks had to go round by a crossover, often
    // beyond the budget or the loaded tiles. Each node is linked to the
    // nearest point of every other way running alongside it, at the real
    // distance across, so the shortest path keeps to one track and crosses
    // only where it has to.
    //
    // 8 m: the Fresno double track is mapped 4–5 m centre to centre, as US
    // main lines generally are (13–15 ft), and sidings and third tracks run
    // up to 7.6 m (25 ft), with half a metre of z14 pixel rounding on top.
    // 12 m would also reach past the next track to the one beyond, which the
    // links already reach through the middle one, and towards separate
    // railways sharing a corridor. 20°: tracks meet at a turnout or crossover
    // at a few degrees, and still link there; a crossing does not, nor a
    // junction leg once it has turned away.
    //
    // Every node is offered again on each extend, since a new tile can bring
    // the other track. A node is never linked to one way twice, and the node
    // a link lands on counts as linked to the ways it came from, so it does
    // not link straight back.
    const maxSin = Math.sin((LINK_MAX_ANGLE_DEG * Math.PI) / 180)
    for (let n = 0; n < this.nodeX.length; n++) {
      const own = this.adjacency[n].filter((edge) => this.edgeWay[edge] !== LINK_WAY)
      if (own.length === 0) continue
      const ownWays = new Set(own.map((edge) => this.edgeWay[edge]))
      const linked = this.linkedWays.get(n)
      const lat = pixelToLngLat([this.nodeX[n], this.nodeY[n]], this.zoom, this.extent)[1]
      const scale = metresPerPixel(lat, this.zoom, this.extent)
      const nearest = new Map<number, EdgePoint>()
      for (const candidate of this.edgePointsNear(this.nodeX[n], this.nodeY[n], LINK_RADIUS_M / scale)) {
        const way = this.edgeWay[candidate.edge]
        if (ownWays.has(way) || linked?.has(way)) continue
        if (!own.some((edge) => this.sinBetween(edge, candidate.edge) <= maxSin)) continue
        const best = nearest.get(way)
        if (!best || candidate.offsetPx < best.offsetPx) nearest.set(way, candidate)
      }
      for (const [way, candidate] of nearest) {
        const target = this.nodeOnEdge(candidate, scale)
        if (target !== n) this.addLink(n, ownWays, target, way)
      }
    }
  }

  private sinBetween(e: number, f: number): number {
    const ex = this.nodeX[this.edgeB[e]] - this.nodeX[this.edgeA[e]]
    const ey = this.nodeY[this.edgeB[e]] - this.nodeY[this.edgeA[e]]
    const fx = this.nodeX[this.edgeB[f]] - this.nodeX[this.edgeA[f]]
    const fy = this.nodeY[this.edgeB[f]] - this.nodeY[this.edgeA[f]]
    return Math.abs(ex * fy - ey * fx) / (Math.hypot(ex, ey) * Math.hypot(fx, fy))
  }

  private nodeOnEdge({ edge, fraction }: EdgePoint, scale: number): number {
    // A link landing within a couple of metres of a vertex goes to the vertex
    // rather than cutting a sliver off the edge beside it.
    const a = this.edgeA[edge]
    const b = this.edgeB[edge]
    const lengthPx = Math.hypot(this.nodeX[b] - this.nodeX[a], this.nodeY[b] - this.nodeY[a])
    if (fraction * lengthPx * scale <= LINK_ENDPOINT_M) return a
    if ((1 - fraction) * lengthPx * scale <= LINK_ENDPOINT_M) return b
    // The edge is cut in place, so it keeps its key (a tile that brings it
    // again still adds nothing) and its grid cells, which cover the first
    // piece as they covered the whole; only the second piece is new.
    const [mx, my] = this.pointOnEdge(edge, fraction)
    const m = this.newNode(mx, my, false)
    const length = this.edgeLengthM[edge]
    this.edgeB[edge] = m
    this.edgeLengthM[edge] = fraction * length
    this.adjacency[m].push(edge)
    const rest = this.edgeA.length
    this.edgeA.push(m)
    this.edgeB.push(b)
    this.edgeWay.push(this.edgeWay[edge])
    this.edgeLengthM.push((1 - fraction) * length)
    this.adjacency[m].push(rest)
    this.adjacency[b][this.adjacency[b].indexOf(edge)] = rest
    this.index(rest)
    return m
  }

  private addLink(n: number, ownWays: Set<number>, target: number, way: number): void {
    const id = this.edgeA.length
    this.edgeA.push(n)
    this.edgeB.push(target)
    this.edgeWay.push(LINK_WAY)
    const midLat = pixelToLngLat([(this.nodeX[n] + this.nodeX[target]) / 2, (this.nodeY[n] + this.nodeY[target]) / 2], this.zoom, this.extent)[1]
    this.edgeLengthM.push(
      Math.hypot(this.nodeX[target] - this.nodeX[n], this.nodeY[target] - this.nodeY[n]) * metresPerPixel(midLat, this.zoom, this.extent),
    )
    // Not in the grid: a link is not track, so nothing snaps to one.
    this.adjacency[n].push(id)
    this.adjacency[target].push(id)
    this.links++
    this.linkedTo(n).add(way)
    const back = this.linkedTo(target)
    for (const from of ownWays) back.add(from)
  }

  private linkedTo(node: number): Set<number> {
    let ways = this.linkedWays.get(node)
    if (!ways) {
      ways = new Set()
      this.linkedWays.set(node, ways)
    }
    return ways
  }

  private wayFor(wayId: number, props: Record<string, unknown>): number {
    const existing = this.wayIndex.get(wayId)
    if (existing !== undefined) return existing
    const way: Way = { wayId, state: railState(props) }
    if (typeof props.name === 'string') way.name = props.name
    if (props.maxspeed !== undefined) way.maxspeed = String(props.maxspeed)
    this.ways.push(way)
    this.wayIndex.set(wayId, this.ways.length - 1)
    return this.ways.length - 1
  }

  private *edgePointsNear(px: number, py: number, radiusPx: number): Generator<EdgePoint> {
    const seen = new Set<number>()
    const cx0 = Math.floor((px - radiusPx) / GRID_CELL_PX)
    const cx1 = Math.floor((px + radiusPx) / GRID_CELL_PX)
    const cy0 = Math.floor((py - radiusPx) / GRID_CELL_PX)
    const cy1 = Math.floor((py + radiusPx) / GRID_CELL_PX)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (const edge of this.grid.get(`${cx},${cy}`) ?? []) {
          if (seen.has(edge)) continue
          seen.add(edge)
          const projected = this.project(edge, px, py)
          if (projected.offsetPx <= radiusPx) yield projected
        }
      }
    }
  }

  private project(edge: number, px: number, py: number): EdgePoint {
    // projectOntoAlignment's leg maths, in pixel space: a whole polyline's
    // frame and chainage are more than one edge needs, and the graph never
    // leaves pixel space until a result is handed out.
    const ax = this.nodeX[this.edgeA[edge]]
    const ay = this.nodeY[this.edgeA[edge]]
    const dx = this.nodeX[this.edgeB[edge]] - ax
    const dy = this.nodeY[this.edgeB[edge]] - ay
    const lengthSq = dx * dx + dy * dy
    const fraction = lengthSq > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0
    return { edge, fraction, offsetPx: Math.hypot(px - (ax + fraction * dx), py - (ay + fraction * dy)) }
  }

  private pointOnEdge(edge: number, fraction: number): [number, number] {
    const a = this.edgeA[edge]
    const b = this.edgeB[edge]
    return [
      this.nodeX[a] + fraction * (this.nodeX[b] - this.nodeX[a]),
      this.nodeY[a] + fraction * (this.nodeY[b] - this.nodeY[a]),
    ]
  }

  private locate(p: LngLat): EdgePoint[] {
    // A point nearestPoint handed out sits on its edge to floating-point
    // precision; a metre of slack forgives a caller that stored it with six
    // decimals, and is still well inside the spacing of parallel tracks.
    const [px, py] = lngLatToPixel(p, this.zoom, this.extent)
    const radiusPx = ON_GRAPH_TOLERANCE_M / metresPerPixel(p[1], this.zoom, this.extent)
    return [...this.edgePointsNear(px, py, radiusPx)]
  }

  private offerArrival(arrival: Map<number, number>, node: number, cost: number): void {
    const known = arrival.get(node)
    if (known === undefined || cost < known) arrival.set(node, cost)
  }

  private relax(dist: Map<number, number>, heap: MinHeap, node: number, cost: number): boolean {
    const known = dist.get(node)
    if (known !== undefined && cost >= known) return false
    dist.set(node, cost)
    heap.push(cost, node)
    return true
  }

  private coordinates(a: LngLat, nodes: number[], b: LngLat): LngLat[] {
    const [ax, ay] = lngLatToPixel(a, this.zoom, this.extent)
    const [bx, by] = lngLatToPixel(b, this.zoom, this.extent)
    const out: LngLat[] = [a]
    for (const n of nodes) {
      // Tile-edge crossings are the graph's own seams, not track vertices,
      // and an end that is a vertex is already in the list as a or b.
      // Unless a link lands on one: there the path changes track, and leaving
      // it out would draw a chord between the two.
      if (this.nodeSynthetic[n] && !this.linkedWays.has(n)) continue
      if (Math.hypot(this.nodeX[n] - ax, this.nodeY[n] - ay) < COINCIDENT_PX) continue
      if (Math.hypot(this.nodeX[n] - bx, this.nodeY[n] - by) < COINCIDENT_PX) continue
      out.push(pixelToLngLat([this.nodeX[n], this.nodeY[n]], this.zoom, this.extent))
    }
    out.push(b)
    return out
  }
}

function clipToSquare(ax: number, ay: number, bx: number, by: number, extent: number): [number, number] | null {
  // Liang–Barsky against [0, extent]²; a segment lying along an edge of the
  // square is inside it, so both tiles sharing that edge keep it and the
  // edge key makes it one.
  const dx = bx - ax
  const dy = by - ay
  let t0 = 0
  let t1 = 1
  const bounds: [number, number][] = [[-dx, ax], [dx, extent - ax], [-dy, ay], [dy, extent - ay]]
  for (const [p, q] of bounds) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  return [t0, t1]
}

class MinHeap {
  private readonly costs: number[] = []
  private readonly nodes: number[] = []

  push(cost: number, node: number): void {
    this.costs.push(cost)
    this.nodes.push(node)
    let i = this.costs.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.costs[parent] <= this.costs[i]) break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): [number, number] | null {
    if (this.costs.length === 0) return null
    const top: [number, number] = [this.costs[0], this.nodes[0]]
    const lastCost = this.costs.pop()!
    const lastNode = this.nodes.pop()!
    if (this.costs.length > 0) {
      this.costs[0] = lastCost
      this.nodes[0] = lastNode
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (left < this.costs.length && this.costs[left] < this.costs[smallest]) smallest = left
        if (right < this.costs.length && this.costs[right] < this.costs[smallest]) smallest = right
        if (smallest === i) break
        this.swap(i, smallest)
        i = smallest
      }
    }
    return top
  }

  private swap(i: number, j: number): void {
    ;[this.costs[i], this.costs[j]] = [this.costs[j], this.costs[i]]
    ;[this.nodes[i], this.nodes[j]] = [this.nodes[j], this.nodes[i]]
  }
}
