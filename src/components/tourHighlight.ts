import {
  ISOCHRONE_LAYER_ID,
  ISOCHRONE_ORIGIN_LAYER_ID,
  isochroneEgressOpacity,
  isochroneOriginOpacity,
} from '../composables/useIsochroneLayer'
import { ORIGIN_WALK_LAYER_ID } from '../composables/useOriginWalkLayer'
import {
  PROGRESS_CAP_LAYER_ID,
  PROGRESS_LINE_LAYER_ID,
  RIDDEN_LINE_LAYER_ID,
  ROUTE_LINE_LAYER_ID,
  STATION_DOTS_LAYER_ID,
  routeBoundsCorners,
  tripProgressCaps,
  tripProgressLines,
} from '../composables/useRouteLayer'
import { isochroneBoundsCorners } from '../fixtures/isochrone'
import { reachedStation, stationNamed, type TourSample } from '../fixtures/tourSample'
import { elapsedSecsOf } from './timeRemaining'
import type { TourStepId } from './tourSteps'

export const TOUR_PARTS = [
  'origin-fill',
  'egress-fill',
  'route-line',
  'ridden-line',
  'progress',
  'station-dots',
  'origin-walk',
  'origin-marker',
] as const

export type TourPart = (typeof TOUR_PARTS)[number]

export const TOUR_DIM_OPACITY = 0.15

type Corners = [[number, number], [number, number]]
type LngLat = [number, number]

export type OpacityProperty = 'fill-opacity' | 'line-opacity' | 'circle-opacity' | 'circle-stroke-opacity'

interface PartPaint {
  layer: string
  property: OpacityProperty
  lit: number
  dim: number
}

const line = (layer: string): PartPaint => ({ layer, property: 'line-opacity', lit: 1, dim: TOUR_DIM_OPACITY })
const circle = (layer: string, property: OpacityProperty = 'circle-opacity'): PartPaint =>
  ({ layer, property, lit: 1, dim: TOUR_DIM_OPACITY })

const PART_PAINT: Record<Exclude<TourPart, 'origin-marker'>, PartPaint[]> = {
  'origin-fill': [{
    layer: ISOCHRONE_ORIGIN_LAYER_ID,
    property: 'fill-opacity',
    lit: isochroneOriginOpacity(false),
    dim: isochroneOriginOpacity(true),
  }],
  'egress-fill': [{
    layer: ISOCHRONE_LAYER_ID,
    property: 'fill-opacity',
    lit: isochroneEgressOpacity(false),
    dim: isochroneEgressOpacity(true),
  }],
  'route-line': [line(ROUTE_LINE_LAYER_ID)],
  'ridden-line': [line(RIDDEN_LINE_LAYER_ID)],
  progress: [line(PROGRESS_LINE_LAYER_ID), circle(PROGRESS_CAP_LAYER_ID)],
  'station-dots': [circle(STATION_DOTS_LAYER_ID), circle(STATION_DOTS_LAYER_ID, 'circle-stroke-opacity')],
  'origin-walk': [line(ORIGIN_WALK_LAYER_ID)],
}

export interface TourPaint {
  layer: string
  property: OpacityProperty
  value: number
}

export type TourCamera = 'start' | 'regional' | 'egress' | 'progress' | 'network'

export function tourPaint(lit: readonly TourPart[] | null, camera: TourCamera = 'regional'): TourPaint[] {
  const isLit = (part: TourPart): boolean => {
    if (lit === null || lit.includes(part)) return true
    // The ridden legs are drawn over the whole network; faded, they let its
    // grey through along a stretch that was ridden, and the map would say
    // nobody rode it.
    return part === 'ridden-line' && lit.includes('route-line')
  }
  // The marker is a DOM element, not a layer: the tour map fades it with CSS.
  const parts = Object.entries(PART_PAINT) as [Exclude<TourPart, 'origin-marker'>, PartPaint[]][]
  return parts.flatMap(([part, entries]) =>
    entries.map(({ layer, property, lit: on, dim }) => {
      // At street level the start sits deep inside both reach areas, and even
      // faded they wash the whole frame; there is nothing of their edges to see.
      const hidden = camera === 'start' && property === 'fill-opacity'
      return { layer, property, value: isLit(part) ? on : hidden ? 0 : dim }
    }),
  )
}

function boundsAround(points: LngLat[], padding: number): Corners {
  const lngs = points.map(([lng]) => lng)
  const lats = points.map(([, lat]) => lat)
  return [
    [Math.min(...lngs) - padding, Math.min(...lats) - padding],
    [Math.max(...lngs) + padding, Math.max(...lats) + padding],
  ]
}

const stationAt = (slug: string, sample: TourSample): LngLat => stationNamed(slug, sample).location.coordinates

function progressCaps(sample: TourSample) {
  return tripProgressCaps(tripProgressLines(sample.routes, sample.plot.metadata.trip_progress)).features
}

const EGRESS_EXAMPLES = ['burbank-airport', 'palmdale']

export function cameraBounds(camera: TourCamera, sample: TourSample): { corners: Corners; maxZoom: number } {
  const { plot, start } = sample
  const origin: LngLat = [start.lng, start.lat]
  const caps = progressCaps(sample).map((f) => f.geometry.coordinates as LngLat)
  switch (camera) {
    case 'start': {
      const walk = (plot.metadata.starter_walk?.geometry.coordinates ?? []) as LngLat[]
      return { corners: boundsAround([origin, ...walk], 0.004), maxZoom: 14.5 }
    }
    case 'regional': {
      const reached = plot.metadata.reachable_stations.map((s) => stationAt(s.station_slug, sample))
      return {
        corners: boundsAround([origin, ...isochroneBoundsCorners(plot.features, 0), ...reached, ...caps], 0.02),
        maxZoom: 10,
      }
    }
    case 'egress': {
      // Close enough that a small area off a station reads as an area, framed
      // on the two the caption sets side by side.
      const areas = plot.features.filter((f) => EGRESS_EXAMPLES.includes(f.properties.station_slug ?? ''))
      const stations = EGRESS_EXAMPLES.map((slug) => stationAt(slug, sample))
      return { corners: boundsAround([...isochroneBoundsCorners(areas, 0), ...stations], 0.03), maxZoom: 11 }
    }
    case 'progress': {
      const from = (plot.metadata.trip_progress ?? []).map((leg) => stationAt(leg.from, sample))
      return { corners: boundsAround([...from, ...caps], 0.12), maxZoom: 10 }
    }
    case 'network': {
      const network = routeBoundsCorners(sample.routes, 0.05)
      return { corners: network ?? boundsAround([origin], 1), maxZoom: 8 }
    }
  }
}

export type CalloutSide = 'top' | 'bottom' | 'left' | 'right'
export type CalloutAnchor = CalloutSide | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type TourCallout =
  | { kind: 'text'; text: string; lngLat: LngLat; anchor: CalloutSide }
  | { kind: 'station'; name: string; elapsedSecs: number | null; lngLat: LngLat; anchor: CalloutSide }
  | { kind: 'progress'; stationName: string; fraction: number; rideSecs: number; lngLat: LngLat; anchor: CalloutSide }

export function calloutFor(step: TourStepId, sample: TourSample): TourCallout {
  // Each step points at one real example on the plot, labelled the way
  // hovering it on the live map would label it.
  const { plot, start } = sample
  const origin: LngLat = [start.lng, start.lat]
  const name = (slug: string) => stationNamed(slug, sample).name
  const station = (slug: string, anchor: CalloutSide): TourCallout => ({
    kind: 'station',
    name: name(slug),
    elapsedSecs: elapsedSecsOf(reachedStation(slug, sample), plot.metadata.origin_budget_mins),
    lngLat: stationAt(slug, sample),
    anchor,
  })
  switch (step) {
    case 'start':
      return { kind: 'text', text: start.label, lngLat: origin, anchor: 'right' }
    case 'starter-walk': {
      const slug = plot.metadata.starter_walk?.station_slug ?? ''
      return {
        kind: 'text',
        text: `${name(slug)} · ${reachedStation(slug, sample).access_mins} min from the start`,
        lngLat: stationAt(slug, sample),
        anchor: 'left',
      }
    }
    case 'origin-reach':
      return { kind: 'text', text: `${sample.budget_mins} min from the start, without the line`, lngLat: origin, anchor: 'top' }
    case 'ridden':
      return station('burbank-airport', 'bottom')
    case 'egress':
      return station('palmdale', 'top')
    case 'unfinished': {
      const caps = progressCaps(sample)
      const cap = caps.find((f) => f.properties.to === 'bakersfield') ?? caps[0]
      return {
        kind: 'progress',
        stationName: name(cap.properties.to),
        fraction: cap.properties.fraction,
        rideSecs: cap.properties.ride_secs,
        lngLat: cap.geometry.coordinates as LngLat,
        anchor: 'left',
      }
    }
    case 'unridden':
      return { kind: 'text', text: 'Not ridden on this trip', lngLat: stationAt('fresno', sample), anchor: 'left' }
  }
}

export function fitAnchor(
  preferred: CalloutSide,
  point: { x: number; y: number },
  frame: { width: number; height: number },
  label: { width: number; height: number } = { width: 240, height: 48 },
  gap = 12,
): CalloutAnchor {
  // A label keeps the side it was written for unless that would run it off the
  // frame: one beside its point crosses to the other side, one above or below
  // flips over, and one that is centred on a point near a side edge leans in.
  if (preferred === 'left') return point.x + gap + label.width > frame.width ? 'right' : 'left'
  if (preferred === 'right') return point.x - gap - label.width < 0 ? 'left' : 'right'
  let vertical: 'top' | 'bottom' = preferred
  if (vertical === 'bottom' && point.y - gap - label.height < 0) vertical = 'top'
  else if (vertical === 'top' && point.y + gap + label.height > frame.height) vertical = 'bottom'
  if (point.x - label.width / 2 < gap) return `${vertical}-left`
  if (point.x + label.width / 2 > frame.width - gap) return `${vertical}-right`
  return vertical
}
