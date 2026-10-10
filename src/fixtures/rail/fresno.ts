/// <reference types="node" />
import { readFileSync } from 'node:fs'
import type { Bbox, RailTileSource } from '../../rail/railGraph'
import { pixelToLngLat } from '../../rail/tileMath'

export const FRESNO_ZOOM = 14
export const FRESNO_EXTENT = 4096

export interface RecordingSource extends RailTileSource {
  requested: string[]
}

export function fresnoTiles(): RecordingSource {
  // The four z14 tiles 2739–2740 × 6391–6392 of the spike's canv-rail.pmtiles
  // (CA+NV, Geofabrik 2026-10-09, osmium + tippecanoe 2.72 per
  // spike-rail-data.md §3, decompressed with PMTiles.getZxy): downtown Fresno,
  // where the UP Fresno Subdivision, BNSF Stockton Subdivision and the CAHSR
  // Construction Package 1 alignment all cross the tile boundaries.
  const requested: string[] = []
  return {
    requested,
    async tile(z, x, y) {
      requested.push(`${z}/${x}/${y}`)
      if (z !== FRESNO_ZOOM || x < 2739 || x > 2740 || y < 6391 || y > 6392) return null
      return new Uint8Array(readFileSync(new URL(`./${z}-${x}-${y}.pbf`, import.meta.url)))
    },
  }
}

export function tileBbox(x0: number, y0: number, x1: number, y1: number): Bbox {
  // A pixel inside each corner tile, so the bbox covers exactly these tiles.
  const [w, n] = pixelToLngLat([x0 * FRESNO_EXTENT + 1, y0 * FRESNO_EXTENT + 1], FRESNO_ZOOM, FRESNO_EXTENT)
  const [e, s] = pixelToLngLat([(x1 + 1) * FRESNO_EXTENT - 1, (y1 + 1) * FRESNO_EXTENT - 1], FRESNO_ZOOM, FRESNO_EXTENT)
  return [w, s, e, n]
}

export const FRESNO_BBOX = tileBbox(2739, 6391, 2740, 6392)

export function fresnoPoint(tileX: number, tileY: number, px: number, py: number): [number, number] {
  return pixelToLngLat([tileX * FRESNO_EXTENT + px, tileY * FRESNO_EXTENT + py], FRESNO_ZOOM, FRESNO_EXTENT)
}
