import { describe, it, expect } from 'vitest'
import { boundsFromFeatures, isochroneBoundsCorners, staticIsochroneResponse } from './isochrone'
import type { ChainResponse } from './isochrone'

type Contour = ChainResponse['features'][number]

function polygon(ring: [number, number][]): Contour {
  return {
    type: 'Feature',
    properties: { source: 'origin' },
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

// What a contour comes back as when denoising splits it into separate pieces —
// two islands of reach with a gap between them.
function multiPolygon(rings: [number, number][][]): Contour {
  return {
    type: 'Feature',
    properties: { source: 'egress', station_slug: 'palmdale' },
    geometry: { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) },
  }
}

const square: [number, number][] = [
  [-118.2, 34.6],
  [-118.1, 34.6],
  [-118.1, 34.7],
  [-118.2, 34.7],
  [-118.2, 34.6],
]

const farSquare: [number, number][] = [
  [-118.5, 34.4],
  [-118.4, 34.4],
  [-118.4, 34.45],
  [-118.5, 34.45],
  [-118.5, 34.4],
]

describe('boundsFromFeatures', () => {
  it('covers a single-piece contour', () => {
    expect(boundsFromFeatures([polygon(square)], 0)).toEqual([-118.2, 34.6, -118.1, 34.7])
  })

  // The fault behind SPA-320: read a ring at a time, a MultiPolygon hands the
  // comparison an array instead of a number and every corner comes out NaN —
  // which fitBounds rejects by throwing, so the camera never moved at all.
  it('covers a contour that came back in several pieces', () => {
    const bounds = boundsFromFeatures([multiPolygon([square, farSquare])], 0)
    expect(bounds.every(Number.isFinite)).toBe(true)
    expect(bounds).toEqual([-118.5, 34.4, -118.1, 34.7])
  })

  it('spans pieces and whole contours together', () => {
    const bounds = boundsFromFeatures([polygon(square), multiPolygon([farSquare])], 0)
    expect(bounds).toEqual([-118.5, 34.4, -118.1, 34.7])
  })

  it('pads the box it found', () => {
    const [minLng, minLat, maxLng, maxLat] = boundsFromFeatures([polygon(square)], 0.04)
    expect(minLng).toBeCloseTo(-118.24, 9)
    expect(minLat).toBeCloseTo(34.56, 9)
    expect(maxLng).toBeCloseTo(-118.06, 9)
    expect(maxLat).toBeCloseTo(34.74, 9)
  })

  it('ignores a coordinate it cannot read rather than poisoning the box', () => {
    const broken = {
      type: 'Feature',
      properties: { source: 'origin' },
      geometry: { type: 'Polygon', coordinates: [[[null, 34.6], ['x', 'y'], ...square]] },
    } as unknown as Contour
    expect(boundsFromFeatures([broken], 0)).toEqual([-118.2, 34.6, -118.1, 34.7])
  })

  it('still reads the sample response', () => {
    expect(boundsFromFeatures(staticIsochroneResponse.features).every(Number.isFinite)).toBe(true)
  })
})

describe('isochroneBoundsCorners', () => {
  it('hands back the box as the two corners fitBounds takes', () => {
    expect(isochroneBoundsCorners([polygon(square)], 0)).toEqual([
      [-118.2, 34.6],
      [-118.1, 34.7],
    ])
  })
})
