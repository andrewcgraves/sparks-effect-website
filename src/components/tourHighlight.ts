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
import type { TourSample } from '../fixtures/tourSample'
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

// The origin marker is a DOM element, not a layer, so it has no paint here: the
// tour map fades it with CSS.
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

export function tourPaint(lit: readonly TourPart[] | null): TourPaint[] {
  return (Object.entries(PART_PAINT) as [TourPart, PartPaint[]][]).flatMap(([part, entries]) =>
    entries.map(({ layer, property, lit: on, dim }) => ({
      layer,
      property,
      value: lit === null || lit.includes(part) ? on : dim,
    })),
  )
}

export type TourCamera = 'start' | 'regional' | 'progress' | 'network'

function boundsAround(points: LngLat[], padding: number): Corners {
  const lngs = points.map(([lng]) => lng)
  const lats = points.map(([, lat]) => lat)
  return [
    [Math.min(...lngs) - padding, Math.min(...lats) - padding],
    [Math.max(...lngs) + padding, Math.max(...lats) + padding],
  ]
}

function corners(c: Corners): LngLat[] {
  return [c[0], c[1]]
}

function stationAt(sample: TourSample, slug: string): LngLat {
  const station = sample.stations.find((s) => s.slug === slug)
  if (!station) throw new Error(`the tour sample has no station ${slug}`)
  return station.location.coordinates
}

function progressCaps(sample: TourSample) {
  return tripProgressCaps(tripProgressLines(sample.routes, sample.plot.metadata.trip_progress)).features
}

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
      const reached = plot.metadata.reachable_stations.map((s) => stationAt(sample, s.station_slug))
      const fills = corners(isochroneBoundsCorners(plot.features, 0))
      return { corners: boundsAround([origin, ...fills, ...reached, ...caps], 0.02), maxZoom: 10 }
    }
    case 'progress': {
      const from = (plot.metadata.trip_progress ?? []).map((leg) => stationAt(sample, leg.from))
      return { corners: boundsAround([...from, ...caps], 0.12), maxZoom: 10 }
    }
    case 'network': {
      const network = routeBoundsCorners(sample.routes, 0.05)
      return { corners: network ?? boundsAround([origin], 1), maxZoom: 8 }
    }
  }
}

export type CalloutAnchor = 'top' | 'bottom' | 'left' | 'right'

export type TourCallout =
  | { kind: 'text'; text: string; lngLat: LngLat; anchor: CalloutAnchor }
  | { kind: 'station'; name: string; remainingSecs: number | null; lngLat: LngLat; anchor: CalloutAnchor }
  | { kind: 'progress'; stationName: string; fraction: number; rideSecs: number; lngLat: LngLat; anchor: CalloutAnchor }

// Each step points at one real example on the plot, written the way hovering it
// on the live map would label it.
export function calloutFor(step: TourStepId, sample: TourSample): TourCallout {
  const { plot, start } = sample
  const origin: LngLat = [start.lng, start.lat]
  const name = (slug: string) => sample.stations.find((s) => s.slug === slug)?.name ?? slug
  switch (step) {
    case 'start':
      return { kind: 'text', text: start.label, lngLat: origin, anchor: 'top' }
    case 'starter-walk': {
      const slug = plot.metadata.starter_walk?.station_slug ?? ''
      const reached = plot.metadata.reachable_stations.find((s) => s.station_slug === slug)
      return {
        kind: 'text',
        text: `${name(slug)} · ${reached?.access_mins ?? 0} min from the start`,
        lngLat: stationAt(sample, slug),
        anchor: 'left',
      }
    }
    case 'origin-reach':
      return { kind: 'text', text: `${sample.budget_mins} min from the start, without the line`, lngLat: origin, anchor: 'top' }
    case 'ridden':
      return { kind: 'station', name: name('burbank-airport'), remainingSecs: null, lngLat: stationAt(sample, 'burbank-airport'), anchor: 'bottom' }
    case 'egress': {
      const palmdale = plot.metadata.reachable_stations.find((s) => s.station_slug === 'palmdale')
      return {
        kind: 'station',
        name: name('palmdale'),
        remainingSecs: palmdale?.remaining_secs ?? (palmdale ? palmdale.remaining_mins * 60 : null),
        lngLat: stationAt(sample, 'palmdale'),
        anchor: 'left',
      }
    }
    case 'unfinished': {
      const cap = progressCaps(sample).find((f) => f.properties.to === 'bakersfield') ?? progressCaps(sample)[0]
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
      return { kind: 'text', text: 'Not ridden on this trip', lngLat: stationAt(sample, 'fresno'), anchor: 'left' }
  }
}
