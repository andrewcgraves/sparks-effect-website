import { describe, expect, it } from 'vitest'
import { layerStack } from '../composables/layerStack'
import { ISOCHRONE_LAYER_ID, ISOCHRONE_ORIGIN_LAYER_ID } from '../composables/useIsochroneLayer'
import { ROUTE_LINE_LAYER_ID, STATION_DOTS_LAYER_ID } from '../composables/useRouteLayer'
import { TOUR_SAMPLE, stationNamed } from '../fixtures/tourSample'
import { progressTooltipText } from './tooltip'
import {
  TOUR_DIM_OPACITY,
  TOUR_PARTS,
  calloutFor,
  cameraBounds,
  fitAnchor,
  tourPaint,
  type TourCamera,
} from './tourHighlight'
import { RIDDEN_LINE_LAYER_ID } from '../composables/useRouteLayer'

const valueOf = (paint: ReturnType<typeof tourPaint>, layer: string, property: string) =>
  paint.find((p) => p.layer === layer && p.property === property)?.value

const contains = ([[w, s], [e, n]]: [[number, number], [number, number]], [lng, lat]: number[]) =>
  lng >= w && lng <= e && lat >= s && lat <= n

const area = ([[w, s], [e, n]]: [[number, number], [number, number]]) => (e - w) * (n - s)

describe('tourPaint', () => {
  it('paints every part as the live map does when nothing is singled out', () => {
    const paint = tourPaint(null)
    expect(valueOf(paint, ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity')).toBe(0.2)
    expect(valueOf(paint, ISOCHRONE_LAYER_ID, 'fill-opacity')).toBe(0.2)
    for (const p of paint.filter((p) => !p.property.startsWith('fill'))) expect(p.value).toBe(1)
  })

  it('dims everything but the lit parts, the fills to their own dim opacities', () => {
    const paint = tourPaint(['egress-fill'])
    expect(valueOf(paint, ISOCHRONE_LAYER_ID, 'fill-opacity')).toBe(0.2)
    expect(valueOf(paint, ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity')).toBe(0.12)
    expect(valueOf(paint, ROUTE_LINE_LAYER_ID, 'line-opacity')).toBe(TOUR_DIM_OPACITY)
    expect(valueOf(paint, STATION_DOTS_LAYER_ID, 'circle-opacity')).toBe(TOUR_DIM_OPACITY)
    expect(valueOf(paint, STATION_DOTS_LAYER_ID, 'circle-stroke-opacity')).toBe(TOUR_DIM_OPACITY)
  })

  // The whole network is drawn under the ridden legs; let them fade and the
  // grey shows through along a stretch that was ridden.
  it('never lets the network show through a ridden stretch', () => {
    expect(valueOf(tourPaint(['route-line']), RIDDEN_LINE_LAYER_ID, 'line-opacity')).toBe(1)
    expect(valueOf(tourPaint(['progress', 'route-line']), RIDDEN_LINE_LAYER_ID, 'line-opacity')).toBe(1)
    expect(valueOf(tourPaint(['egress-fill']), RIDDEN_LINE_LAYER_ID, 'line-opacity')).toBe(TOUR_DIM_OPACITY)
  })

  it('clears the reach areas off the street-level view of the start', () => {
    const paint = tourPaint(['origin-walk', 'origin-marker'], 'start')
    expect(valueOf(paint, ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity')).toBe(0)
    expect(valueOf(paint, ISOCHRONE_LAYER_ID, 'fill-opacity')).toBe(0)
    expect(valueOf(tourPaint(['origin-fill'], 'start'), ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity')).toBe(0.2)
  })

  it('only touches layers the map stacks', () => {
    const stack = layerStack()
    for (const { layer } of tourPaint(null)) expect(stack).toContain(layer)
  })
})

describe('cameraBounds', () => {
  const { plot, start } = TOUR_SAMPLE

  it('frames the whole plot, every reached station and both unfinished rides at regional zoom', () => {
    const { corners } = cameraBounds('regional', TOUR_SAMPLE)
    expect(contains(corners, [start.lng, start.lat])).toBe(true)
    for (const s of plot.metadata.reachable_stations) {
      expect(contains(corners, stationNamed(s.station_slug).location.coordinates)).toBe(true)
    }
    const cap = calloutFor('unfinished', TOUR_SAMPLE).lngLat
    expect(contains(corners, cap)).toBe(true)
  })

  it('closes in on the station areas far enough for them to read', () => {
    const { corners } = cameraBounds('egress', TOUR_SAMPLE)
    for (const slug of ['burbank-airport', 'palmdale']) {
      expect(contains(corners, stationNamed(slug).location.coordinates)).toBe(true)
    }
    expect(area(corners)).toBeLessThan(area(cameraBounds('regional', TOUR_SAMPLE).corners) / 2)
  })

  it('closes in on the start for the first leg, and pulls back to the network for the rest', () => {
    const size = (camera: TourCamera) => area(cameraBounds(camera, TOUR_SAMPLE).corners)
    expect(size('start')).toBeLessThan(size('regional'))
    expect(size('regional')).toBeLessThan(size('network'))
    expect(contains(cameraBounds('start', TOUR_SAMPLE).corners, stationNamed('los-angeles').location.coordinates)).toBe(true)
  })
})

describe('calloutFor', () => {
  it('labels a station area with the minutes left, as hovering it would', () => {
    const callout = calloutFor('egress', TOUR_SAMPLE)
    expect(callout).toMatchObject({ kind: 'station', name: stationNamed('palmdale').name, remainingSecs: 745 })
  })

  it('labels a ridden-through station with its minutes left, as hovering it would', () => {
    expect(calloutFor('ridden', TOUR_SAMPLE)).toMatchObject({ kind: 'station', remainingSecs: 3565 })
  })

  it('labels the unfinished ride with how far short it fell, as hovering its dot would', () => {
    const callout = calloutFor('unfinished', TOUR_SAMPLE)
    expect(callout.kind).toBe('progress')
    if (callout.kind !== 'progress') return
    expect(callout.stationName).toBe(stationNamed('bakersfield').name)
    expect(progressTooltipText(callout.fraction, callout.stationName, callout.rideSecs)).toMatch(
      /^44% of the way to Bakersfield — 16m short$/,
    )
  })

  it('has a callout for every step, placed on a real point', () => {
    for (const id of ['start', 'starter-walk', 'origin-reach', 'ridden', 'egress', 'unfinished', 'unridden'] as const) {
      const { lngLat } = calloutFor(id, TOUR_SAMPLE)
      expect(lngLat.every(Number.isFinite)).toBe(true)
    }
  })
})

describe('TOUR_PARTS', () => {
  it('names the marker and every dimmable layer group', () => {
    expect(TOUR_PARTS).toContain('origin-marker')
    expect(TOUR_PARTS).toHaveLength(8)
  })
})

describe('fitAnchor', () => {
  const frame = { width: 400, height: 300 }

  const label = { width: 200, height: 40 }

  it('keeps a side label on its side, and crosses over only when it would run off', () => {
    expect(fitAnchor('left', { x: 100, y: 150 }, frame, label)).toBe('left')
    expect(fitAnchor('left', { x: 300, y: 150 }, frame, label)).toBe('right')
    expect(fitAnchor('right', { x: 300, y: 150 }, frame, label)).toBe('right')
    expect(fitAnchor('right', { x: 100, y: 150 }, frame, label)).toBe('left')
  })

  it('keeps a label above or below its point off the frame\'s edges', () => {
    expect(fitAnchor('top', { x: 200, y: 150 }, frame, label)).toBe('top')
    expect(fitAnchor('top', { x: 40, y: 150 }, frame, label)).toBe('top-left')
    expect(fitAnchor('bottom', { x: 380, y: 150 }, frame, label)).toBe('bottom-right')
    expect(fitAnchor('bottom', { x: 200, y: 20 }, frame, label)).toBe('top')
    expect(fitAnchor('top', { x: 200, y: 290 }, frame, label)).toBe('bottom')
  })
})
