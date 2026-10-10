import { PbfWriter } from 'pbf'
import type { RailTileSource } from '../../rail/railGraph'

export interface SyntheticWay {
  id: number
  props: Record<string, string | number>
  pixels: [number, number][]
}

export interface EncodeOptions {
  extent?: number
  buffer?: number
  layer?: string
}

const MOVE_TO = 1
const LINE_TO = 2

export function encodeTile(tileX: number, tileY: number, ways: SyntheticWay[], options: EncodeOptions = {}): Uint8Array {
  const extent = options.extent ?? 4096
  const buffer = options.buffer ?? 80
  const layer = options.layer ?? 'rail'
  const keys: string[] = []
  const values: (string | number)[] = []
  const index = (list: (string | number)[], item: string | number): number => {
    const at = list.indexOf(item)
    if (at >= 0) return at
    list.push(item)
    return list.length - 1
  }
  const features = ways.flatMap((way) => {
    const parts = clipWay(way.pixels.map(([gx, gy]) => [gx - tileX * extent, gy - tileY * extent]), extent, buffer)
    if (parts.length === 0) return []
    const tags = Object.entries(way.props).flatMap(([k, v]) => [index(keys, k), index(values, v)])
    return [{ id: way.id, tags, geometry: encodeGeometry(parts) }]
  })

  const pbf = new PbfWriter()
  pbf.writeMessage(3, (_: undefined, out: PbfWriter) => {
    out.writeVarintField(15, 2)
    out.writeStringField(1, layer)
    for (const feature of features) {
      out.writeMessage(2, (f: typeof feature, fp: PbfWriter) => {
        fp.writeVarintField(1, f.id)
        fp.writePackedVarint(2, f.tags)
        fp.writeVarintField(3, 2)
        fp.writePackedVarint(4, f.geometry)
      }, feature)
    }
    for (const key of keys) out.writeStringField(3, key)
    for (const value of values) {
      out.writeMessage(4, (v: string | number, vp: PbfWriter) => {
        if (typeof v === 'string') vp.writeStringField(1, v)
        else vp.writeDoubleField(3, v)
      }, value)
    }
    out.writeVarintField(5, extent)
  }, undefined)
  return pbf.finish()
}

export function syntheticSource(tiles: Record<string, Uint8Array>): RailTileSource {
  return {
    async tile(z, x, y) {
      return tiles[`${z}/${x}/${y}`] ?? null
    },
  }
}

function clipWay(local: [number, number][], extent: number, buffer: number): [number, number][][] {
  // What tippecanoe does to a way at z14: keep what falls inside the tile
  // plus its buffer, cut it there to an integer point, and start a new part
  // wherever it leaves and comes back.
  const lo = -buffer
  const hi = extent + buffer
  const parts: [number, number][][] = []
  let current: [number, number][] | null = null
  for (let i = 1; i < local.length; i++) {
    const [ax, ay] = local[i - 1]
    const [bx, by] = local[i]
    const span = clip(ax, ay, bx, by, lo, hi)
    if (!span) {
      current = null
      continue
    }
    const [t0, t1] = span
    const start: [number, number] = [Math.round(ax + t0 * (bx - ax)), Math.round(ay + t0 * (by - ay))]
    const end: [number, number] = [Math.round(ax + t1 * (bx - ax)), Math.round(ay + t1 * (by - ay))]
    if (t0 > 0 || !current) {
      current = [start]
      parts.push(current)
    }
    current.push(end)
    if (t1 < 1) current = null
  }
  return parts
}

function clip(ax: number, ay: number, bx: number, by: number, lo: number, hi: number): [number, number] | null {
  const dx = bx - ax
  const dy = by - ay
  let t0 = 0
  let t1 = 1
  const bounds: [number, number][] = [[-dx, ax - lo], [dx, hi - ax], [-dy, ay - lo], [dy, hi - ay]]
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

function encodeGeometry(parts: [number, number][][]): number[] {
  const zigzag = (n: number): number => (n << 1) ^ (n >> 31)
  const out: number[] = []
  let cx = 0
  let cy = 0
  for (const part of parts) {
    part.forEach(([x, y], i) => {
      if (i === 0) out.push((MOVE_TO & 0x7) | (1 << 3))
      else if (i === 1) out.push((LINE_TO & 0x7) | ((part.length - 1) << 3))
      out.push(zigzag(x - cx), zigzag(y - cy))
      cx = x
      cy = y
    })
  }
  return out
}
