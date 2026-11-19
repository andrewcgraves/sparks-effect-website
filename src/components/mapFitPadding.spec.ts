import { describe, expect, it } from 'vitest'
import { mapFitPadding } from './mapFitPadding'

describe('mapFitPadding', () => {
  it('keeps the site’s padding on a map with room for it', () => {
    expect(mapFitPadding(1200, 700)).toEqual({ top: 56, bottom: 112, left: 56, right: 56 })
  })

  // 56 + 112 is more than half of a 300px frame; MapLibre answers a padding
  // that leaves no room by zooming out to the whole world.
  it('shrinks with a small embed so the fit still has most of the frame', () => {
    expect(mapFitPadding(320, 300)).toEqual({ top: 30, bottom: 60, left: 48, right: 48 })
    expect(mapFitPadding(640, 480)).toEqual({ top: 48, bottom: 96, left: 56, right: 56 })
  })

  it('keeps the site’s padding for a map not yet measured', () => {
    expect(mapFitPadding(0, 0)).toEqual({ top: 56, bottom: 112, left: 56, right: 56 })
    expect(mapFitPadding(320, 0)).toEqual({ top: 56, bottom: 112, left: 56, right: 56 })
  })

  it('never lets the content touch the edge', () => {
    expect(mapFitPadding(40, 40)).toEqual({ top: 8, bottom: 8, left: 8, right: 8 })
  })
})
