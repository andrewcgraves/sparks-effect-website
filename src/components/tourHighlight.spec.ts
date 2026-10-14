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
  tourPaint,
  type TourCamera,
} from './tourHighlight'

const valueOf = (paint: ReturnType<typeof tourPaint>, layer: string, property: string) =>
  paint.find((p) => p.layer === layer && p.property === property)?.value

const contains = ([[w, s], [e, n]]: [[number, number], [number, number]], [lng, lat]: number[]) =>
  lng >= w && lng <= e && lat >= s && lat <= n

const area = ([[w, s], [e, n]]: [[number, number], [number, number]]) => (e - w) * (n - s)

describe('tourPaint', () => {
  it('paints every part as the live map does when nothing is singled out', () => {
    const paint = tourPaint(null)
    expect(valueOf(paint, ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity')).toBe(0.35)
    expect(valueOf(paint, ISOCHRONE_LAYER_ID, 'fill-opacity')).toBe(0.35)
    for (const p of paint.filter((p) => !p.property.startsWith('fill'))) expect(p.value).toBe(1)
  })

  it('dims everything but the lit parts, the fills as far as a station highlight dims them', () => {
    const paint = tourPaint(['egress-fill'])
    expect(valueOf(paint, ISOCHRONE_LAYER_ID, 'fill-opacity')).toBe(0.35)
    expect(valueOf(paint, ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity')).toBe(0.12)
    expect(valueOf(paint, ROUTE_LINE_LAYER_ID, 'line-opacity')).toBe(TOUR_DIM_OPACITY)
    expect(valueOf(paint, STATION_DOTS_LAYER_ID, 'circle-opacity')).toBe(TOUR_DIM_OPACITY)
    expect(valueOf(paint, STATION_DOTS_LAYER_ID, 'circle-stroke-opacity')).toBe(TOUR_DIM_OPACITY)
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
