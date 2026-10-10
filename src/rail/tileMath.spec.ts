import { describe, it, expect } from 'vitest'
import { lngLatToPixel, lngLatToTile, metresPerPixel, pixelToLngLat, tileRange, worldSize } from './tileMath'

const EXTENT = 4096

describe('tileMath', () => {
  it('finds the z14 tiles the spike looked up', () => {
    // From the spike's tilecoords.py: Fresno downtown and Oakland Jack London Square.
    expect(lngLatToTile([-119.79, 36.74], 14)).toEqual([2740, 6391])
    expect(lngLatToTile([-122.278, 37.797], 14)).toEqual([2626, 6331])
    expect(lngLatToTile([-122.278, 37.797], 9)).toEqual([82, 197])
  })

  it('puts the null island at the centre of the world and the antimeridian on its edges', () => {
    const size = worldSize(14, EXTENT)
    expect(size).toBe(2 ** 26)
    const [x, y] = lngLatToPixel([0, 0], 14, EXTENT)
    expect(x).toBeCloseTo(size / 2, 6)
    expect(y).toBeCloseTo(size / 2, 6)
    expect(lngLatToPixel([-180, 0], 14, EXTENT)[0]).toBe(0)
    expect(lngLatToPixel([180, 0], 14, EXTENT)[0]).toBe(size)
    expect(lngLatToTile([180, 0], 14)[0]).toBe(2 ** 14 - 1)
  })

  it('round-trips a tile-local vertex to lng/lat and back', () => {
    const pixel: [number, number] = [2740 * EXTENT + 2268, 6392 * EXTENT + 10]
    const lngLat = pixelToLngLat(pixel, 14, EXTENT)
    expect(lngLat[0]).toBeCloseTo(-119.79, 1)
    expect(lngLat[1]).toBeCloseTo(36.73, 1)
    const back = lngLatToPixel(lngLat, 14, EXTENT)
    expect(back[0]).toBeCloseTo(pixel[0], 6)
    expect(back[1]).toBeCloseTo(pixel[1], 6)
  })

  it('covers a bbox with the inclusive tile range whose top-left is the north-west corner', () => {
    const range = tileRange([-119.82, 36.70, -119.78, 36.74], 14)
    // Corner tiles checked against the spike's tilecoords.py formula.
    expect(range).toEqual({ x0: 2738, y0: 6391, x1: 2740, y1: 6394 })
    expect(tileRange([-119.79, 36.74, -119.79, 36.74], 14)).toEqual({ x0: 2740, y0: 6391, x1: 2740, y1: 6391 })
  })

  it('scales a z14 pixel to ground metres by the cosine of the latitude', () => {
    const equator = (2 * Math.PI * 6371000) / 2 ** 26
    expect(metresPerPixel(0, 14, EXTENT)).toBeCloseTo(equator, 9)
    expect(metresPerPixel(60, 14, EXTENT)).toBeCloseTo(equator / 2, 9)
    expect(metresPerPixel(36.74, 14, EXTENT)).toBeCloseTo(0.478, 3)
  })
})
