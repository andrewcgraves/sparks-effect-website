// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { RailGraph, railState } from './railGraph'
import type { LngLat } from './railGraph'
import { chainageAlong } from '../chainage'
import { lngLatToPixel, metresPerPixel, pixelToLngLat } from './tileMath'
import { FRESNO_BBOX, FRESNO_EXTENT, FRESNO_ZOOM, fresnoPoint, fresnoTiles, tileBbox } from '../fixtures/rail/fresno'
import { encodeTile, syntheticSource } from '../fixtures/rail/mvt'
import type { SyntheticWay } from '../fixtures/rail/mvt'

const ZOOM = FRESNO_ZOOM
const EXTENT = FRESNO_EXTENT

describe('railState', () => {
  it('maps the railway tag onto the three states', () => {
    expect(railState({ railway: 'proposed', proposed: 'rail' })).toBe('proposed')
    expect(railState({ railway: 'construction', construction: 'rail' })).toBe('construction')
    expect(railState({ railway: 'rail' })).toBe('existing')
    expect(railState({ railway: 'disused' })).toBe('existing')
    expect(railState({})).toBe('existing')
  })
})

// Two hand-built tiles, L = 2739/6391 and R = 2740/6391, in global z14 pixels.
const L = 2739
const R = 2740
const Y = 6391
const ox = L * EXTENT
const oy = Y * EXTENT
const g = (x: number, y: number): [number, number] => [ox + x, oy + y]
const at = (x: number, y: number): LngLat => pixelToLngLat(g(x, y), ZOOM, EXTENT)

const main: SyntheticWay = {
  id: 1,
  props: { railway: 'rail', name: 'Main', maxspeed: '79 mph' },
  pixels: [g(1000, 2000), g(3000, 2000), g(EXTENT + 3000, 2000), g(EXTENT + 3500, 2000)],
}
// Entirely inside R, close enough to the edge to be repeated in L's buffer.
const spur: SyntheticWay = {
  id: 2,
  props: { railway: 'rail', service: 'spur' },
  pixels: [g(EXTENT + 20, 500), g(EXTENT + 60, 900)],
}
// Leaves Main at a junction and ends on a vertex inside L's buffer of R.
const branch: SyntheticWay = {
  id: 3,
  props: { railway: 'construction', construction: 'rail', name: 'Branch' },
  pixels: [g(3000, 2000), g(3000, 3000), g(EXTENT + 40, 3100)],
}
const stub: SyntheticWay = {
  id: 4,
  props: { railway: 'proposed', proposed: 'rail', name: 'Stub' },
  pixels: [g(500, 3500), g(800, 3500)],
}
const ways = [main, spur, branch, stub]
const synthetic = syntheticSource({
  [`${ZOOM}/${L}/${Y}`]: encodeTile(L, Y, ways),
  [`${ZOOM}/${R}/${Y}`]: encodeTile(R, Y, ways),
})
const leftBbox = tileBbox(L, Y, L, Y)
const rightBbox = tileBbox(R, Y, R, Y)
const bothBbox = tileBbox(L, Y, R, Y)

function pixelsOf(path: LngLat[]): [number, number][] {
  return path.map((p) => {
    const [x, y] = lngLatToPixel(p, ZOOM, EXTENT)
    return [Math.round((x - ox) * 1000) / 1000, Math.round((y - oy) * 1000) / 1000]
  })
}

describe('RailGraph on hand-built tiles', () => {
  it('cuts each tile at its own edge and merges the crossing from both sides', async () => {
    const left = await RailGraph.load(synthetic, leftBbox)
    const right = await RailGraph.load(synthetic, rightBbox)
    const both = await RailGraph.load(synthetic, bothBbox)
    // L: Main 1000, 3000, crossing; Branch 3000/3000, crossing; Stub ×2.
    expect(left.nodeCount).toBe(7)
    expect(left.edgeCount).toBe(5)
    // R: Main crossing, 3000, 3500; Spur ×2; Branch crossing, 40/3100.
    expect(right.nodeCount).toBe(7)
    expect(right.edgeCount).toBe(4)
    // Together the two crossings are shared, and nothing else is.
    expect(both.nodeCount).toBe(12)
    expect(both.edgeCount).toBe(9)
  })

  it('drops a way that a tile only sees in its buffer', async () => {
    const graph = await RailGraph.load(synthetic, leftBbox)
    expect(graph.nearestPoint(at(EXTENT + 40, 700), 50)).toBeNull()
    await graph.extend(synthetic, rightBbox)
    expect(graph.nearestPoint(at(EXTENT + 40, 700), 50)?.wayId).toBe(2)
    expect(graph.nodeCount).toBe(12)
    expect(graph.edgeCount).toBe(9)
  })

  it('snaps to the nearest way and reports its state, name and maxspeed', async () => {
    const graph = await RailGraph.load(synthetic, bothBbox)
    const scale = metresPerPixel(at(2000, 2010)[1], ZOOM, EXTENT)

    const onMain = graph.nearestPoint(at(2000, 2010), 20)
    expect(onMain).toMatchObject({ wayId: 1, name: 'Main', state: 'existing', maxspeed: '79 mph' })
    expect(onMain?.offsetM).toBeCloseTo(10 * scale, 6)
    expect(pixelsOf([onMain!.point])[0]).toEqual([2000, 2000])

    expect(graph.nearestPoint(at(2990, 2500), 20)).toMatchObject({ wayId: 3, state: 'construction', name: 'Branch' })
    expect(graph.nearestPoint(at(650, 3490), 20)).toMatchObject({ wayId: 4, state: 'proposed', maxspeed: undefined })
    expect(graph.nearestPoint(at(2000, 2100), 20)).toBeNull()
    expect(graph.nearestPoint(at(2000, 2100), 100)?.wayId).toBe(1)
  })

  it('walks between two points in the middle of one edge', async () => {
    const graph = await RailGraph.load(synthetic, bothBbox)
    const a = graph.nearestPoint(at(1200, 2005), 10)!.point
    const b = graph.nearestPoint(at(1800, 1995), 10)!.point
    expect(pixelsOf(graph.walk(a, b, 10_000)!)).toEqual([[1200, 2000], [1800, 2000]])
    expect(pixelsOf(graph.walk(b, a, 10_000)!)).toEqual([[1800, 2000], [1200, 2000]])
  })

  it('walks across the tile boundary without a vertex at the seam', async () => {
    const graph = await RailGraph.load(synthetic, bothBbox)
    const a = graph.nearestPoint(at(2000, 2000), 10)!.point
    const b = graph.nearestPoint(at(EXTENT + 3250, 2000), 10)!.point
    const path = graph.walk(a, b, 10_000)!
    expect(pixelsOf(path)).toEqual([[2000, 2000], [3000, 2000], [EXTENT + 3000, 2000], [EXTENT + 3250, 2000]])
    const scale = metresPerPixel(a[1], ZOOM, EXTENT)
    const length = chainageAlong(path).at(-1)!
    expect(length).toBeCloseTo((EXTENT + 1250) * scale, 0)
  })

  it('walks through a junction onto another way and state', async () => {
    const graph = await RailGraph.load(synthetic, bothBbox)
    const a = graph.nearestPoint(at(3000, 2500), 10)!.point
    const b = graph.nearestPoint(at(1500, 2000), 10)!.point
    expect(pixelsOf(graph.walk(a, b, 10_000)!)).toEqual([[3000, 2500], [3000, 2000], [1500, 2000]])
    // And along the branch into the next tile, through the second seam.
    const c = graph.nearestPoint(at(EXTENT + 30, 3099), 10)!.point
    const onward = pixelsOf(graph.walk(b, c, 10_000)!)
    expect(onward.slice(0, 3)).toEqual([[1500, 2000], [3000, 2000], [3000, 3000]])
    expect(onward).toHaveLength(4)
    expect(onward[3][0]).toBeCloseTo(EXTENT + 30, 1)
    expect(onward[3][1]).toBeCloseTo(3099.1, 1)
  })

  it('gives up when the budget runs out or nothing connects', async () => {
    const graph = await RailGraph.load(synthetic, bothBbox)
    const a = graph.nearestPoint(at(2000, 2000), 10)!.point
    const b = graph.nearestPoint(at(EXTENT + 3250, 2000), 10)!.point
    const scale = metresPerPixel(a[1], ZOOM, EXTENT)
    expect(graph.walk(a, b, (EXTENT + 1250) * scale * 0.99)).toBeNull()
    expect(graph.walk(a, b, (EXTENT + 1250) * scale * 1.01)).not.toBeNull()
    const stubPoint = graph.nearestPoint(at(650, 3500), 10)!.point
    expect(graph.walk(a, stubPoint, 1_000_000)).toBeNull()
    expect(graph.walk(a, at(2000, 2100), 1_000_000)).toBeNull()
  })

  it('adds nothing for a way that only touches a tile at its edge or corner', async () => {
    // A vertex exactly on the L/R seam: L sees the way leave from it and R
    // sees it arrive, and neither piece has any length inside the square.
    const onSeam: SyntheticWay = {
      id: 5,
      props: { railway: 'rail' },
      pixels: [g(3500, 1000), g(EXTENT, 1000), g(EXTENT + 500, 1000)],
    }
    // Passes through L's south-east corner without entering it.
    const corner: SyntheticWay = {
      id: 6,
      props: { railway: 'rail' },
      pixels: [g(EXTENT + 100, EXTENT - 100), g(EXTENT - 100, EXTENT + 100)],
    }
    const source = syntheticSource({
      [`${ZOOM}/${L}/${Y}`]: encodeTile(L, Y, [onSeam, corner]),
      [`${ZOOM}/${R}/${Y}`]: encodeTile(R, Y, [onSeam]),
    })
    const left = await RailGraph.load(source, leftBbox)
    expect(left.nodeCount).toBe(2)
    expect(left.edgeCount).toBe(1)
    const both = await RailGraph.load(source, bothBbox)
    expect(both.nodeCount).toBe(3)
    expect(both.edgeCount).toBe(2)
    const a = both.nearestPoint(at(3600, 1000), 10)!.point
    const b = both.nearestPoint(at(EXTENT + 400, 1000), 10)!.point
    expect(pixelsOf(both.walk(a, b, 10_000)!)).toEqual([[3600, 1000], [EXTENT, 1000], [EXTENT + 400, 1000]])
  })

  it('fetches each tile once across load and extend', async () => {
    const requested: string[] = []
    const counting = {
      tile: (z: number, x: number, y: number) => {
        requested.push(`${z}/${x}/${y}`)
        return synthetic.tile(z, x, y)
      },
    }
    const graph = await RailGraph.load(counting, leftBbox)
    await graph.extend(counting, bothBbox)
    await graph.extend(counting, bothBbox)
    expect(requested).toEqual([`${ZOOM}/${L}/${Y}`, `${ZOOM}/${R}/${Y}`])
  })
})

// Double track as OSM maps it: two ways 10 px (≈4.8 m) apart for ≈1 km,
// sharing no node. Track B's vertices sit halfway between track A's.
const trackA: SyntheticWay = {
  id: 11,
  props: { railway: 'rail', name: 'Track A' },
  pixels: Array.from({ length: 22 }, (_, i) => g(1000 + 100 * i, 1000)),
}
const trackB: SyntheticWay = {
  id: 12,
  props: { railway: 'rail', name: 'Track B' },
  pixels: [g(1000, 1010), ...Array.from({ length: 21 }, (_, i) => g(1050 + 100 * i, 1010)), g(3100, 1010)],
}
// A road-like crossing, square to both, ending a few metres short of B.
const across: SyntheticWay = {
  id: 13,
  props: { railway: 'rail', name: 'Across' },
  pixels: [g(2050, 1018), g(2050, 1600)],
}
// In the next tile and nowhere near the tracks: loading it re-offers every
// node for linking without bringing anything to link to.
const elsewhere: SyntheticWay = {
  id: 14,
  props: { railway: 'rail' },
  pixels: [g(EXTENT + 1000, 3000), g(EXTENT + 3000, 3000)],
}

function doubleTrack(ways: SyntheticWay[]) {
  return syntheticSource({
    [`${ZOOM}/${L}/${Y}`]: encodeTile(L, Y, ways),
    [`${ZOOM}/${R}/${Y}`]: encodeTile(R, Y, ways),
  })
}

describe('RailGraph on double track', () => {
  it('offers the nearest point of each track, nearest first', async () => {
    const graph = await RailGraph.load(doubleTrack([trackA, trackB]), leftBbox)
    const hits = graph.nearestPoints(at(2000, 1004), 20, 3)
    expect(hits.map((h) => h.wayId)).toEqual([11, 12])
    expect(hits.map((h) => h.name)).toEqual(['Track A', 'Track B'])
    expect(pixelsOf(hits.map((h) => h.point))).toEqual([[2000, 1000], [2000, 1010]])
    expect(hits[0].offsetM).toBeLessThan(hits[1].offsetM)
    expect(graph.nearestPoints(at(2000, 1004), 20, 1).map((h) => h.wayId)).toEqual([11])
    expect(graph.nearestPoint(at(2000, 1006), 20)?.wayId).toBe(12)
  })

  it('walks from one track to the other, crossing once, and keeps to one track when it can', async () => {
    const graph = await RailGraph.load(doubleTrack([trackA, trackB]), leftBbox)
    expect(graph.linkCount).toBeGreaterThan(0)
    const a = graph.nearestPoint(at(1230, 1000), 1)!
    const b = graph.nearestPoint(at(2770, 1010), 1)!
    expect([a.wayId, b.wayId]).toEqual([11, 12])
    const across = graph.walk(a.point, b.point, 10_000)!
    expect(across).not.toBeNull()
    for (const vertex of across) expect(graph.nearestPoint(vertex, 1)?.offsetM).toBeLessThan(0.01)
    const scale = metresPerPixel(a.point[1], ZOOM, EXTENT)
    const straight = chainageAlong([a.point, b.point]).at(-1)!
    expect(chainageAlong(across).at(-1)! - straight).toBeCloseTo(10 * scale, 0)
    const changes = pixelsOf(across).filter(([, y], i, path) => i > 0 && y !== path[i - 1][1])
    expect(changes).toHaveLength(1)

    const c = graph.nearestPoint(at(2770, 1000), 1)!
    const along = graph.walk(a.point, c.point, 10_000)!
    expect(pixelsOf(along).every(([, y]) => y === 1000)).toBe(true)
    expect(chainageAlong(along).at(-1)!).toBeCloseTo(chainageAlong([a.point, c.point]).at(-1)!, 6)
  })

  it('links no way that crosses the tracks', async () => {
    const parallel = await RailGraph.load(doubleTrack([trackA, trackB]), leftBbox)
    const crossed = await RailGraph.load(doubleTrack([trackA, trackB, across]), leftBbox)
    expect(parallel.linkCount).toBeGreaterThan(0)
    expect(crossed.linkCount).toBe(parallel.linkCount)
    const onAcross = crossed.nearestPoint(at(2050, 1300), 1)!
    expect(onAcross.wayId).toBe(13)
    const onB = crossed.nearestPoint(at(2050, 1010), 1)!
    expect(crossed.walk(onAcross.point, onB.point, 10_000)).toBeNull()
  })

  it('links each node once however often the graph is extended', async () => {
    const source = doubleTrack([trackA, trackB, elsewhere])
    const graph = await RailGraph.load(source, leftBbox)
    const links = graph.linkCount
    expect(links).toBeGreaterThan(0)
    await graph.extend(source, rightBbox)
    expect(graph.nearestPoint(at(EXTENT + 2000, 3000), 1)?.wayId).toBe(14)
    expect(graph.linkCount).toBe(links)
    await graph.extend(source, bothBbox)
    expect(graph.linkCount).toBe(links)
  })
})

describe('RailGraph on the Fresno tiles', () => {
  it('loads exactly the z14 tiles covering the bbox', async () => {
    const source = fresnoTiles()
    const graph = await RailGraph.load(source, FRESNO_BBOX)
    expect(source.requested.sort()).toEqual(['14/2739/6391', '14/2739/6392', '14/2740/6391', '14/2740/6392'])
    expect(graph.edgeCount).toBeGreaterThan(300)
  })

  it('snaps a click near the BNSF junction to the BNSF Stockton Subdivision', async () => {
    const graph = await RailGraph.load(fresnoTiles(), FRESNO_BBOX)
    const hit = graph.nearestPoint(fresnoPoint(2740, 6392, 2275, 6), 25)
    expect(hit).toMatchObject({ name: 'BNSF Stockton Subdivision', state: 'existing' })
    expect(['35 mph', '40 mph']).toContain(hit?.maxspeed)
    expect(hit!.offsetM).toBeLessThan(5)
    expect(graph.nearestPoint(fresnoPoint(2740, 6392, 2275, 6), 1)).toBeNull()
  })

  it('snaps onto the CAHSR alignment as construction', async () => {
    const graph = await RailGraph.load(fresnoTiles(), FRESNO_BBOX)
    const hit = graph.nearestPoint(fresnoPoint(2740, 6392, 866, 2383), 25)
    expect(hit).toMatchObject({ wayId: 1034053392, name: 'Construction Package 1', state: 'construction', maxspeed: '250 mph' })
  })

  it('walks the BNSF main line across the 6391/6392 tile boundary', async () => {
    const graph = await RailGraph.load(fresnoTiles(), FRESNO_BBOX)
    const a = graph.nearestPoint(fresnoPoint(2740, 6391, 1443, 1411), 5)!
    const b = graph.nearestPoint(fresnoPoint(2740, 6392, 3064, 914), 5)!
    expect(a.wayId).toBe(225554353)
    expect(b.wayId).toBe(221323617)
    const path = graph.walk(a.point, b.point, 5_000)!
    expect(path).not.toBeNull()
    expect(path[0]).toEqual(a.point)
    expect(path.at(-1)).toEqual(b.point)
    for (const vertex of path) expect(graph.nearestPoint(vertex, 1)?.offsetM).toBeLessThan(0.01)
    const straight = chainageAlong([a.point, b.point]).at(-1)!
    const along = chainageAlong(path).at(-1)!
    expect(along).toBeGreaterThan(straight)
    expect(along).toBeLessThan(straight * 1.3)
    const junction = lngLatToPixel(fresnoPoint(2740, 6392, 2268, 10), ZOOM, EXTENT)
    const throughJunction = path.some((p) => {
      const [x, y] = lngLatToPixel(p, ZOOM, EXTENT)
      return Math.hypot(x - junction[0], y - junction[1]) < 1e-6
    })
    expect(throughJunction).toBe(true)
    expect(graph.walk(a.point, b.point, straight)).toBeNull()
  })

  it('walks the UP Fresno Subdivision across the 2739/2740 tile boundary', async () => {
    const graph = await RailGraph.load(fresnoTiles(), FRESNO_BBOX)
    const a = graph.nearestPoint(fresnoPoint(2739, 6392, 3488, 558), 5)!
    const b = graph.nearestPoint(fresnoPoint(2740, 6392, 12, 1260), 5)!
    expect(a.name).toBe('UP Fresno Subdivision')
    const path = graph.walk(a.point, b.point, 3_000)!
    expect(path).not.toBeNull()
    for (const vertex of path) expect(graph.nearestPoint(vertex, 1)?.offsetM).toBeLessThan(0.01)
    const straight = chainageAlong([a.point, b.point]).at(-1)!
    expect(chainageAlong(path).at(-1)!).toBeLessThan(straight * 1.1)
  })

  it('walks across the double-tracked BNSF Stockton Subdivision without going round by a crossover', async () => {
    const graph = await RailGraph.load(fresnoTiles(), FRESNO_BBOX)
    expect(graph.linkCount).toBeGreaterThan(0)
    // Found by probing every vertex pair of the two tracks: unlinked, the
    // nearest crossover put this 120 m hop beyond the editor's 500 m budget.
    const a = graph.nearestPoint(fresnoPoint(2740, 6392, 4087, 2140), 1)!
    const b = graph.nearestPoint(fresnoPoint(2740, 6392, 3955, 1930), 1)!
    expect([a.wayId, b.wayId]).toEqual([641020480, 221323617])
    expect([a.name, b.name]).toEqual(['BNSF Stockton Subdivision', 'BNSF Stockton Subdivision'])
    const path = graph.walk(a.point, b.point, 500)!
    expect(path).not.toBeNull()
    for (const vertex of path) expect(graph.nearestPoint(vertex, 1)?.offsetM).toBeLessThan(0.01)
    const straight = chainageAlong([a.point, b.point]).at(-1)!
    expect(chainageAlong(path).at(-1)!).toBeLessThan(straight + 10)
  })
})
