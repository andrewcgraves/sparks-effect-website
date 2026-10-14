import { describe, expect, it } from 'vitest'
import { ORIGIN_WALK_DASH, ORIGIN_WALK_LINE_WIDTH } from '../composables/useOriginWalkLayer'
import { PROGRESS_LINE_DASH, ROUTE_LINE_WIDTH } from '../composables/useRouteLayer'
import { layerStack } from '../composables/layerStack'
import { ISOCHRONE_LAYER_ID, ISOCHRONE_ORIGIN_LAYER_ID } from '../composables/useIsochroneLayer'
import { ORIGIN_WALK_LAYER_ID } from '../composables/useOriginWalkLayer'
import {
  PROGRESS_CAP_LAYER_ID,
  PROGRESS_LINE_LAYER_ID,
  RIDDEN_LINE_LAYER_ID,
  ROUTE_LINE_LAYER_ID,
  STATION_DOTS_LAYER_ID,
} from '../composables/useRouteLayer'
import { SAMPLE_MAP_PARTS, sampleMapPaint, svgDash } from './sampleMapData'

describe('svgDash', () => {
  it('turns a MapLibre dash, in line widths, into SVG pixels', () => {
    expect(svgDash(PROGRESS_LINE_DASH, ROUTE_LINE_WIDTH)).toBe('2.5 8.75')
    expect(svgDash(ORIGIN_WALK_DASH, ORIGIN_WALK_LINE_WIDTH)).toBe('2 4')
  })
})

describe('sampleMapPaint', () => {
  it('paints the sample the way the map paints a plot', () => {
    expect(sampleMapPaint()).toEqual({
      origin: '#1034b1',
      egress: '#f28f29',
      fillOpacity: 0.35,
      unridden: '#b8b8be',
      ink: '#121212',
      reachedStation: '#f28f29',
      unreachedStation: '#ffffff',
      pin: '#e1665b',
      lineWidth: 2.5,
      progressDash: '2.5 8.75',
      capRadius: 3.5,
      stationRadius: 5,
      stationStrokeWidth: 2,
      walkWidth: 2,
      walkDash: '2 4',
    })
  })
})

describe('SAMPLE_MAP_PARTS', () => {
  it('stacks the parts the way the map stacks its layers, with the start pin on top', () => {
    const layerOf: Record<string, string> = {
      'origin-fill': ISOCHRONE_ORIGIN_LAYER_ID,
      'egress-fill': ISOCHRONE_LAYER_ID,
      'route-line': ROUTE_LINE_LAYER_ID,
      'ridden-line': RIDDEN_LINE_LAYER_ID,
      'progress-line': PROGRESS_LINE_LAYER_ID,
      'progress-cap': PROGRESS_CAP_LAYER_ID,
      'station-dots': STATION_DOTS_LAYER_ID,
      'origin-walk': ORIGIN_WALK_LAYER_ID,
    }
    const layered = SAMPLE_MAP_PARTS.slice(0, -1)
    expect(SAMPLE_MAP_PARTS.at(-1)).toBe('origin-marker')
    expect([...layered].sort((a, b) => layerStack().indexOf(layerOf[a]) - layerStack().indexOf(layerOf[b])))
      .toEqual(Object.keys(layerOf))
    expect(layered).toEqual(Object.keys(layerOf))
  })
})
