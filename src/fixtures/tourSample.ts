import raw from './tourSample.json'
import type { ChainResponse } from './isochrone'
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

export function stationNamed(slug: string): Station {
  const station = TOUR_SAMPLE.stations.find((s) => s.slug === slug)
  if (!station) throw new Error(`the tour sample has no station ${slug}`)
  return station
}

export function reachedStation(slug: string) {
  const reached = TOUR_SAMPLE.plot.metadata.reachable_stations.find((s) => s.station_slug === slug)
  if (!reached) throw new Error(`the tour sample does not reach ${slug}`)
  return reached
}
