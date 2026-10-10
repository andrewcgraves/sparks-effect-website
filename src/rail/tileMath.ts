const EARTH_RADIUS_M = 6371000
const MAX_LAT = 85.05112878

const toRad = (deg: number): number => (deg * Math.PI) / 180

export type LngLat = [number, number]
export type Bbox = [number, number, number, number]

export interface TileRange {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function worldSize(zoom: number, extent: number): number {
  return extent * 2 ** zoom
}

export function lngLatToPixel([lng, lat]: LngLat, zoom: number, extent: number): [number, number] {
  const size = worldSize(zoom, extent)
  const sinLat = Math.sin(toRad(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))))
  return [
    ((lng + 180) / 360) * size,
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size,
  ]
}

export function pixelToLngLat([x, y]: [number, number], zoom: number, extent: number): LngLat {
  const size = worldSize(zoom, extent)
  const n = Math.PI - (2 * Math.PI * y) / size
  return [(x / size) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]
}

export function lngLatToTile(lngLat: LngLat, zoom: number): [number, number] {
  const [x, y] = lngLatToPixel(lngLat, zoom, 1)
  // Longitude 180 and the clamped poles land exactly on the far edge of the
  // world, which is the first pixel of a tile that does not exist.
  const last = 2 ** zoom - 1
  return [Math.min(last, Math.floor(x)), Math.min(last, Math.floor(y))]
}

export function tileRange([w, s, e, n]: Bbox, zoom: number): TileRange {
  const [x0, y0] = lngLatToTile([w, n], zoom)
  const [x1, y1] = lngLatToTile([e, s], zoom)
  return { x0, y0, x1, y1 }
}

export function metresPerPixel(lat: number, zoom: number, extent: number): number {
  // Web Mercator is conformal, so at one latitude a pixel is the same length
  // of ground in every direction: planar maths in pixel space is the same
  // maths as in chainage.ts's equirectangular frame, scaled by this.
  return (2 * Math.PI * EARTH_RADIUS_M * Math.cos(toRad(lat))) / worldSize(zoom, extent)
}
