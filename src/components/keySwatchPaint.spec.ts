import { describe, expect, it } from 'vitest'
import { ORIGIN_WALK_DASH, ORIGIN_WALK_LINE_WIDTH } from '../composables/useOriginWalkLayer'
import { PROGRESS_LINE_DASH, ROUTE_LINE_WIDTH } from '../composables/useRouteLayer'
import { keySwatchPaint, svgDash } from './keySwatchPaint'

describe('svgDash', () => {
  it('turns a MapLibre dash, in line widths, into SVG pixels', () => {
    expect(svgDash(PROGRESS_LINE_DASH, ROUTE_LINE_WIDTH)).toBe('2.5 8.75')
    expect(svgDash(ORIGIN_WALK_DASH, ORIGIN_WALK_LINE_WIDTH)).toBe('2 4')
  })
})

describe('keySwatchPaint', () => {
  it('paints each swatch the way the map paints its layer', () => {
    expect(keySwatchPaint()).toEqual({
      origin: '#1034b1',
      egress: '#f28f29',
      unridden: '#b8b8be',
      ink: '#121212',
      pin: '#e1665b',
      lineWidth: 2.5,
      progressDash: '2.5 8.75',
      capRadius: 3.5,
      walkWidth: 2,
      walkDash: '2 4',
    })
  })
})
