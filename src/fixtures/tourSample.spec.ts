import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOUR_SAMPLE } from './tourSample'
import { egressStationSlugs } from '../composables/useIsochroneLayer'
import { originWalkLine } from '../composables/useOriginWalkLayer'
import { riddenLegs, riddenLines, tripProgressLines } from '../composables/useRouteLayer'

const { plot, routes, stations } = TOUR_SAMPLE

function positions(value: unknown): number[] {
  if (typeof value === 'number') return [value]
  return Array.isArray(value) ? value.flatMap(positions) : []
}

describe('the tour sample', () => {
  it('names only stations and lines it carries', () => {
    const slugs = new Set(stations.map((s) => s.slug))
    for (const s of plot.metadata.reachable_stations) expect(slugs).toContain(s.station_slug)
    expect(slugs).toContain(plot.metadata.starter_walk?.station_slug)
    const routeIds = new Set(routes.map((r) => r.id))
    for (const leg of plot.metadata.trip_progress ?? []) expect(routeIds).toContain(leg.route_id)
  })

  it('draws every part the tour explains', () => {
    expect(originWalkLine(plot)).not.toBeNull()
    expect(riddenLines(routes, stations, riddenLegs(plot)).features).toHaveLength(3)
    expect(tripProgressLines(routes, plot.metadata.trip_progress).features).toHaveLength(2)
    expect(egressStationSlugs(plot)).toEqual(new Set(['anaheim', 'burbank-airport', 'palmdale']))
  })

  it('keeps only what the map reads, at five decimal places', () => {
    for (const feature of plot.features) {
      expect(Object.keys(feature.properties).every((k) => ['source', 'station_slug', 'remaining_mins'].includes(k))).toBe(true)
    }
    const coordinates = [
      ...positions(plot.features.map((f) => f.geometry.coordinates)),
      ...positions(routes.map((r) => r.geometry.coordinates)),
      ...positions(stations.map((s) => s.location.coordinates)),
    ]
    expect(coordinates.every((v) => Math.round(v * 1e5) / 1e5 === v)).toBe(true)
  })

  it('stays small enough to ship with the page', () => {
    expect(readFileSync(resolve(process.cwd(), 'src/fixtures/tourSample.json')).byteLength).toBeLessThanOrEqual(200_000)
  })
})
