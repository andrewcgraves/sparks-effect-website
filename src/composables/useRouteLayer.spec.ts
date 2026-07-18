import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import {
  useRouteLayer,
  routeBoundsCorners,
  centerFromCorners,
  ROUTE_SOURCE_ID,
  ROUTE_LINE_LAYER_ID,
  STATION_SOURCE_ID,
  STATION_DOTS_LAYER_ID,
} from './useRouteLayer'
import type { Route, Station } from '../api/scenarios'

const route: Route = {
  id: 'r1',
  scenario_id: 's1',
  name: 'Main Line',
  mode: 'hsr',
  geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
  bidirectional: true,
}

const station: Station = {
  id: 'st1',
  scenario_id: 's1',
  slug: 'sf',
  name: 'San Francisco',
  location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
  platform_height: '0',
}

function makeMockMap(): Pick<Map, 'addSource' | 'addLayer'> {
  return {
    addSource: vi.fn(),
    addLayer: vi.fn(),
  }
}

describe('useRouteLayer', () => {
  it('adds a GeoJSON source for routes', () => {
    const map = makeMockMap()
    useRouteLayer(map as Map, [route], [])
    expect(map.addSource).toHaveBeenCalledWith(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: expect.objectContaining({ type: 'FeatureCollection' }),
    })
  })

  it('route source FeatureCollection includes a Feature for each route', () => {
    const map = makeMockMap()
    useRouteLayer(map as Map, [route], [])
    const call = (map.addSource as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === ROUTE_SOURCE_ID,
    )
    const data = call?.[1]?.data
    expect(data.features).toHaveLength(1)
    expect(data.features[0].geometry).toEqual(route.geometry)
  })

  it('adds a line layer for routes', () => {
    const map = makeMockMap()
    useRouteLayer(map as Map, [route], [])
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ROUTE_LINE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID }),
    )
  })

  it('adds a GeoJSON source for stations', () => {
    const map = makeMockMap()
    useRouteLayer(map as Map, [], [station])
    expect(map.addSource).toHaveBeenCalledWith(STATION_SOURCE_ID, {
      type: 'geojson',
      data: expect.objectContaining({ type: 'FeatureCollection' }),
    })
  })

  it('station source FeatureCollection includes a Feature for each station', () => {
    const map = makeMockMap()
    useRouteLayer(map as Map, [], [station])
    const call = (map.addSource as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === STATION_SOURCE_ID,
    )
    const data = call?.[1]?.data
    expect(data.features).toHaveLength(1)
    expect(data.features[0].geometry).toEqual(station.location)
  })

  it('adds a circle layer for stations', () => {
    const map = makeMockMap()
    useRouteLayer(map as Map, [], [station])
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: STATION_DOTS_LAYER_ID, type: 'circle', source: STATION_SOURCE_ID }),
    )
  })

  it('handles empty routes and stations without error', () => {
    const map = makeMockMap()
    expect(() => useRouteLayer(map as Map, [], [])).not.toThrow()
  })

  describe('routeBoundsCorners', () => {
    it('pads corners proportionally to the route bounds span by default', () => {
      const corners = routeBoundsCorners([route])
      // lngSpan 0.5 * 0.1, latSpan 0.4 * 0.1
      expect(corners?.[0][0]).toBeCloseTo(-122.45, 5)
      expect(corners?.[0][1]).toBeCloseTo(37.26, 5)
      expect(corners?.[1][0]).toBeCloseTo(-121.85, 5)
      expect(corners?.[1][1]).toBeCloseTo(37.74, 5)
    })

    it('scales padding down for a much smaller route instead of applying a fixed absolute amount', () => {
      const shortRoute: Route = {
        ...route,
        geometry: { type: 'LineString', coordinates: [[-122.41, 37.71], [-122.4, 37.7]] },
      }
      const corners = routeBoundsCorners([shortRoute])
      expect(corners?.[0][0]).toBeCloseTo(-122.411, 6)
      expect(corners?.[0][1]).toBeCloseTo(37.699, 6)
      expect(corners?.[1][0]).toBeCloseTo(-122.399, 6)
      expect(corners?.[1][1]).toBeCloseTo(37.711, 6)
    })

    it('spans multiple routes', () => {
      const otherRoute: Route = {
        ...route,
        id: 'r2',
        geometry: { type: 'LineString', coordinates: [[-118.25, 34.05], [-117.9, 33.8]] },
      }
      const corners = routeBoundsCorners([route, otherRoute], 0)
      expect(corners?.[0][0]).toBeCloseTo(-122.4, 5)
      expect(corners?.[0][1]).toBeCloseTo(33.8, 5)
      expect(corners?.[1][0]).toBeCloseTo(-117.9, 5)
      expect(corners?.[1][1]).toBeCloseTo(37.7, 5)
    })

    it('returns null when there are no routes', () => {
      expect(routeBoundsCorners([])).toBeNull()
    })
  })

  describe('centerFromCorners', () => {
    it('returns the midpoint of the given corners', () => {
      expect(centerFromCorners([[-122.44, 37.26], [-121.86, 37.74]])).toEqual([-122.15, 37.5])
    })
  })
})
