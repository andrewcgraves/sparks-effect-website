/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Bbox, RailTileSource } from '../../rail/railGraph'
import { pixelToLngLat } from '../../rail/tileMath'

export const FRESNO_ZOOM = 14
export const FRESNO_EXTENT = 4096

export interface RecordingSource extends RailTileSource {
  requested: string[]
}

export function fresnoTiles(): RecordingSource {
  // The four z14 tiles 2739–2740 × 6391–6392 of the spike's canv-rail.pmtiles
  // (CA+NV, Geofabrik 2026-10-09; osmium tags-filter/export with "id": true,
  // then tippecanoe 2.72 `-l rail -Z 4 -z 14 --use-attribute-for-id=@id
  // --simplify-only-low-zooms --no-feature-limit --no-tile-size-limit` at the
  // default 5/256 buffer; each tile decompressed with PMTiles.getZxy):
  // downtown Fresno, where the UP Fresno Subdivision, BNSF Stockton
  // Subdivision and the CAHSR Construction Package 1 alignment all cross the
  // tile boundaries. z14 being unsimplified is what keeps the two tiles'
  // crossings of one way within RailGraph's merge distance of each other.
  const requested: string[] = []
  return {
    requested,
    async tile(z, x, y) {
      requested.push(`${z}/${x}/${y}`)
      if (z !== FRESNO_ZOOM || x < 2739 || x > 2740 || y < 6391 || y > 6392) return null
      // From the project root rather than import.meta.url: under happy-dom
      // that is an http:// URL, and the tiles are read by specs in both
      // environments.
      return new Uint8Array(readFileSync(resolve(process.cwd(), 'src', 'fixtures', 'rail', `${z}-${x}-${y}.pbf`)))
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
