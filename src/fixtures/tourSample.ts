import raw from './tourSample.json'
import type { ChainResponse, ReachableStation } from './isochrone'
import type { Route, Station } from '../api/scenarios'

export interface TourSample {
  captured: string
  start: { label: string; lat: number; lng: number }
  budget_mins: number
  mode: string
  plot: ChainResponse
  routes: Route[]
  stations: Station[]
}

export const TOUR_SAMPLE = raw as unknown as TourSample

export function stationNamed(slug: string, sample: TourSample = TOUR_SAMPLE): Station {
  const station = sample.stations.find((s) => s.slug === slug)
  if (!station) throw new Error(`the tour sample has no station ${slug}`)
  return station
}

export function reachedStation(slug: string, sample: TourSample = TOUR_SAMPLE): ReachableStation {
  const reached = sample.plot.metadata.reachable_stations.find((s) => s.station_slug === slug)
  if (!reached) throw new Error(`the tour sample does not reach ${slug}`)
  return reached
}
