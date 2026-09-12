import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import {
  useRouteLayer,
  routeBoundsCorners,
  centerFromCorners,
  reachableStationSlugs,
  stationDotColor,
  routeLayerModule,
  ROUTE_SOURCE_ID,
  ROUTE_LINE_LAYER_ID,
  STATION_SOURCE_ID,
  STATION_DOTS_LAYER_ID,
  STATION_DOT_DEFAULT_COLOR,
  PROGRESS_LINE_LAYER_ID,
  PROGRESS_CAP_LAYER_ID,
  RIDDEN_LINE_LAYER_ID,
  RIDDEN_SOURCE_ID,
  RIDDEN_LINE_WIDTH,
  UNRIDDEN_LINE_WIDTH,
  riddenLegs,
  riddenLines,
  routeLinePaint,
  tripProgressLines,
  tripProgressCaps,
  type TripProgressLines,
} from './useRouteLayer'
import type { Route, Station } from '../api/scenarios'
import type { ChainResponse, TripProgress } from '../fixtures/isochrone'

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

function makeMockMap(): Pick<Map, 'addSource' | 'addLayer' | 'getSource' | 'getLayer'> {
  return {
    addSource: vi.fn(),
    addLayer: vi.fn(),
    // Returning nothing stands for a map whose sources have not been added yet.
    // The module's sync reaches for the progress sources through optional
    // chaining precisely so that case is a no-op rather than a crash.
    getSource: vi.fn(),
    getLayer: vi.fn(),
  }
}

function paintOf(
  map: Pick<Map, 'addLayer'>,
  layerID: string,
): Record<string, unknown> {
  const call = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.find(
    (c: unknown[]) => (c[0] as { id: string }).id === layerID,
  )
  return call?.[0].paint
}

const progressRoute: Route = {
  id: 'rt-progress',
  scenario_id: 's1',
  name: 'Progress Line',
  mode: 'hsr',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-122.0, 37.0],
      [-122.0, 37.2],
      [-121.8, 37.2],
      [-121.8, 37.5],
    ],
  },
  bidirectional: true,
}

const PROGRESS_LINE_LENGTH_M = 73305.61201653583

// Stations on the progress route: two of its vertices, plus one nowhere near it.
function stationAt(slug: string, coordinates: [number, number]): Station {
  return {
    id: `st-${slug}`,
    scenario_id: 's1',
    slug,
    name: slug,
    location: { type: 'Point', coordinates },
    platform_height: '0',
  }
}

const stationA = stationAt('a', [-122.0, 37.0])
const stationB = stationAt('b', [-121.8, 37.2])
const stationC = stationAt('c', [-121.8, 37.5])

function chainWithLegs(
  legs: NonNullable<ChainResponse['metadata']['reachable_stations'][number]['legs']>,
): ChainResponse {
  return chainWith([{ station_slug: 'b', access_mins: 5, remaining_mins: 10, legs }])
}

function progressEntry(overrides: Partial<TripProgress> = {}): TripProgress {
  return {
    from: 'a',
    to: 'b',
    service_id: 'svc',
    route_id: progressRoute.id,
    from_chainage_m: 0,
    to_chainage_m: PROGRESS_LINE_LENGTH_M,
    fraction: 0.5,
    remaining_secs: 300,
    ride_secs: 600,
    ...overrides,
  }
}

function chainWithProgress(progress: TripProgress[]): ChainResponse {
  const response = chainWith([])
  response.metadata.trip_progress = progress
  return response
}

function chainWith(stations: ChainResponse['metadata']['reachable_stations']): ChainResponse {
  return {
    type: 'FeatureCollection',
    features: [],
    metadata: {
      reachable_stations: stations,
      origin_budget_mins: 90,
      compile_job_id: 'compile-1',
      mode: 'walk',
      wait_model: 'none',
      origin_iso_available: true,
    },
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

  it('paints station dots the default color when no stations are reachable', () => {
    const map = makeMockMap()
    useRouteLayer(map as Map, [], [station])
    const call = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[0] as { id: string }).id === STATION_DOTS_LAYER_ID,
    )
    expect(call?.[0].paint['circle-color']).toBe(STATION_DOT_DEFAULT_COLOR)
  })

  it('paints station dots with a match expression against the reachable slugs', () => {
    const map = makeMockMap()
    useRouteLayer(
      map as Map,
      [],
      [station],
      chainWith([
        { station_slug: 'sf', access_mins: 5, remaining_mins: 10 },
        { station_slug: 'gilroy', access_mins: 9, remaining_mins: 4 },
      ]),
      '#f28f29',
    )
    const call = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[0] as { id: string }).id === STATION_DOTS_LAYER_ID,
    )
    expect(call?.[0].paint['circle-color']).toEqual([
      'match',
      ['get', 'slug'],
      ['sf', 'gilroy'],
      '#f28f29',
      STATION_DOT_DEFAULT_COLOR,
    ])
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

  describe('stationDotColor', () => {
    it('falls back to the plain default color when nothing is reachable', () => {
      expect(stationDotColor([], '#f28f29')).toBe(STATION_DOT_DEFAULT_COLOR)
    })

    it('builds a match expression keying the highlight color off the slug property', () => {
      expect(stationDotColor(['sf'], '#f28f29')).toEqual([
        'match',
        ['get', 'slug'],
        ['sf'],
        '#f28f29',
        STATION_DOT_DEFAULT_COLOR,
      ])
    })
  })

  describe('reachableStationSlugs', () => {
    it('returns an empty list when there is no plot yet', () => {
      expect(reachableStationSlugs(null)).toEqual([])
    })

    it('reads the station_slug off each reachable station', () => {
      const data = chainWith([
        { station_slug: 'sf', access_mins: 22, remaining_mins: 60 },
        { station_slug: 'gilroy', access_mins: 40, remaining_mins: 20 },
      ])
      expect(reachableStationSlugs(data)).toEqual(['sf', 'gilroy'])
    })
  })

  describe('ridden legs', () => {
    const leg = (from: string, to: string) => ({ from, to, service_id: 'svc', secs: 600 })

    it('reads the ridden path off every reachable station, drawing a shared hop once', () => {
      const data = chainWith([
        { station_slug: 'b', access_mins: 5, remaining_mins: 40, legs: [leg('a', 'b')] },
        { station_slug: 'c', access_mins: 5, remaining_mins: 10, legs: [leg('a', 'b'), leg('b', 'c')] },
      ])
      expect(riddenLegs(data)).toEqual([
        { from: 'a', to: 'b', service_id: 'svc' },
        { from: 'b', to: 'c', service_id: 'svc' },
      ])
    })

    it('finds nothing ridden on a plot with no transit legs, or no plot at all', () => {
      expect(riddenLegs(null)).toEqual([])
      expect(riddenLegs(chainWith([{ station_slug: 'b', access_mins: 5, remaining_mins: 10 }]))).toEqual([])
    })

    it('draws the alignment between the two stations, not a chord', () => {
      const lines = riddenLines([progressRoute], [stationA, stationB], [
        { from: 'a', to: 'b' },
      ])
      expect(lines.features).toHaveLength(1)
      expect(lines.features[0].geometry.coordinates).toEqual([
        [-122.0, 37.0],
        [-122.0, 37.2],
        [-121.8, 37.2],
      ])
    })

    it('draws a leg ridden against the alignment direction from the station left behind', () => {
      const lines = riddenLines([progressRoute], [stationA, stationB], [
        { from: 'b', to: 'a' },
      ])
      expect(lines.features[0].geometry.coordinates).toEqual([
        [-121.8, 37.2],
        [-122.0, 37.2],
        [-122.0, 37.0],
      ])
    })

    it('draws every hop of a path, end to end', () => {
      const lines = riddenLines([progressRoute], [stationA, stationB, stationC], [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ])
      expect(lines.features).toHaveLength(2)
      const first = lines.features[0].geometry.coordinates
      const second = lines.features[1].geometry.coordinates
      expect(second[0]).toEqual(first[first.length - 1])
      expect(second[second.length - 1]).toEqual([-121.8, 37.5])
    })

    it('carries the leg it describes onto the feature', () => {
      const lines = riddenLines([progressRoute], [stationA, stationB], [
        { from: 'a', to: 'b', service_id: 'svc' },
      ])
      expect(lines.features[0].properties).toEqual({ from: 'a', to: 'b', service_id: 'svc' })
    })

    // A leg is only drawable against an alignment both its stations stand on, and
    // the map must still render without it.
    it('skips a leg whose stations this map does not hold', () => {
      const lines = riddenLines([progressRoute], [stationA], [{ from: 'a', to: 'b' }])
      expect(lines.features).toHaveLength(0)
    })

    it('skips a leg whose stations sit off every alignment on the map', () => {
      const offRoute = stationAt('far', [-121.0, 37.2])
      const lines = riddenLines([progressRoute], [stationA, offRoute], [{ from: 'a', to: 'far' }])
      expect(lines.features).toHaveLength(0)
    })

    it('prefers the alignment the two stations stand closest to', () => {
      const detour: Route = {
        ...progressRoute,
        id: 'rt-detour',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.002, 37.0],
            [-122.002, 37.2],
            [-121.802, 37.2],
          ],
        },
      }
      const lines = riddenLines([detour, progressRoute], [stationA, stationB], [{ from: 'a', to: 'b' }])
      expect(lines.features[0].geometry.coordinates).toEqual([
        [-122.0, 37.0],
        [-122.0, 37.2],
        [-121.8, 37.2],
      ])
    })
  })

  describe('the three states of a line', () => {
    it('draws the whole network in ink at full width when there is no plot', () => {
      expect(routeLinePaint(false)).toEqual({ 'line-color': '#121212', 'line-width': RIDDEN_LINE_WIDTH })
    })

    it('drops the network back to grey and thinner once there is a plot to be unridden against', () => {
      expect(routeLinePaint(true)).toEqual({ 'line-color': '#4a4a4f', 'line-width': UNRIDDEN_LINE_WIDTH })
      expect(UNRIDDEN_LINE_WIDTH).toBeLessThan(RIDDEN_LINE_WIDTH)
    })

    it('paints the route line for the plot it was attached with', () => {
      const plotted = makeMockMap()
      useRouteLayer(plotted as Map, [progressRoute], [stationA, stationB], chainWithLegs([]))
      expect(paintOf(plotted, ROUTE_LINE_LAYER_ID)).toEqual(routeLinePaint(true))

      const bare = makeMockMap()
      useRouteLayer(bare as Map, [progressRoute], [stationA, stationB])
      expect(paintOf(bare, ROUTE_LINE_LAYER_ID)).toEqual(routeLinePaint(false))
    })

    it('draws the ridden legs over the network in ink at full width', () => {
      const map = makeMockMap()
      useRouteLayer(
        map as Map,
        [progressRoute],
        [stationA, stationB],
        chainWithLegs([{ from: 'a', to: 'b', service_id: 'svc', secs: 600 }]),
      )
      expect(paintOf(map, RIDDEN_LINE_LAYER_ID)).toEqual({
        'line-color': '#121212',
        'line-width': RIDDEN_LINE_WIDTH,
      })

      const source = (map.addSource as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === RIDDEN_SOURCE_ID,
      )
      expect(source?.[1].data.features).toHaveLength(1)
    })

    // The cap is a full stop on the dashes rather than a station, and every
    // station dot on this map is ringed.
    it('caps the unfinished leg with a plain ink dot', () => {
      const map = makeMockMap()
      useRouteLayer(
        map as Map,
        [progressRoute],
        [stationA],
        chainWithProgress([progressEntry({ fraction: 0.5 })]),
      )
      const cap = paintOf(map, PROGRESS_CAP_LAYER_ID)
      expect(cap['circle-color']).toBe('#121212')
      expect(cap['circle-stroke-width']).toBeUndefined()
    })
  })

  describe('routeLayerModule', () => {
    it('attaches the station layer already painted with the initial reach', () => {
      const map = makeMockMap()
      const data = chainWith([{ station_slug: 'sf', access_mins: 5, remaining_mins: 10 }])
      const module = routeLayerModule(() => ({ routes: [route], stations: [station] }), () => data, '#f28f29')
      module.attach(map as Map)
      const call = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => (c[0] as { id: string }).id === STATION_DOTS_LAYER_ID,
      )
      expect(call?.[0].paint['circle-color']).toEqual([
        'match',
        ['get', 'slug'],
        ['sf'],
        '#f28f29',
        STATION_DOT_DEFAULT_COLOR,
      ])
    })

    it('re-paints the station dots on sync when the reachable set changes', () => {
      const map: Pick<Map, 'addSource' | 'addLayer' | 'setPaintProperty'> = {
        ...makeMockMap(),
        setPaintProperty: vi.fn(),
      }
      let data: ChainResponse | null = null
      const module = routeLayerModule(() => ({ routes: [route], stations: [station] }), () => data, '#f28f29')
      module.attach(map as Map)

      data = chainWith([{ station_slug: 'sf', access_mins: 5, remaining_mins: 10 }])
      module.sync(map as Map)

      expect(map.setPaintProperty).toHaveBeenCalledWith(STATION_DOTS_LAYER_ID, 'circle-color', [
        'match',
        ['get', 'slug'],
        ['sf'],
        '#f28f29',
        STATION_DOT_DEFAULT_COLOR,
      ])
    })

    it('re-paints the network grey and thin when the first plot arrives', () => {
      const map: Pick<Map, 'addSource' | 'addLayer' | 'setPaintProperty'> = {
        ...makeMockMap(),
        setPaintProperty: vi.fn(),
      }
      let data: ChainResponse | null = null
      const module = routeLayerModule(
        () => ({ routes: [progressRoute], stations: [stationA, stationB] }),
        () => data,
        '#f28f29',
      )
      module.attach(map as Map)
      expect(paintOf(map, ROUTE_LINE_LAYER_ID)).toEqual(routeLinePaint(false))

      data = chainWithLegs([{ from: 'a', to: 'b', service_id: 'svc', secs: 600 }])
      module.sync(map as Map)

      expect(map.setPaintProperty).toHaveBeenCalledWith(
        ROUTE_LINE_LAYER_ID,
        'line-color',
        routeLinePaint(true)['line-color'],
      )
      expect(map.setPaintProperty).toHaveBeenCalledWith(
        ROUTE_LINE_LAYER_ID,
        'line-width',
        UNRIDDEN_LINE_WIDTH,
      )
    })

    it('re-draws the ridden legs on sync, because a new reach rides different ones', () => {
      const setData = vi.fn()
      const map: Pick<Map, 'addSource' | 'addLayer' | 'setPaintProperty'> & {
        getSource: ReturnType<typeof vi.fn>
      } = {
        ...makeMockMap(),
        setPaintProperty: vi.fn(),
        getSource: vi.fn((id: string) => (id === RIDDEN_SOURCE_ID ? { setData } : undefined)),
      }

      let data: ChainResponse | null = null
      const module = routeLayerModule(
        () => ({ routes: [progressRoute], stations: [stationA, stationB] }),
        () => data,
        '#f28f29',
      )
      module.attach(map as unknown as Map)

      data = chainWithLegs([{ from: 'a', to: 'b', service_id: 'svc', secs: 600 }])
      module.sync(map as unknown as Map)

      expect(setData).toHaveBeenCalledTimes(1)
      expect(setData.mock.calls[0][0].features).toHaveLength(1)
    })

    it('re-draws the progress stubs on sync, because a new reach moves them', () => {
      const map: Pick<Map, 'addSource' | 'addLayer' | 'setPaintProperty'> & {
        getSource: ReturnType<typeof vi.fn>
      } = {
        ...makeMockMap(),
        setPaintProperty: vi.fn(),
        getSource: vi.fn(() => ({ setData })),
      }
      const setData = vi.fn()

      let data: ChainResponse | null = null
      const module = routeLayerModule(
        () => ({ routes: [progressRoute], stations: [station] }),
        () => data,
        '#f28f29',
      )
      module.attach(map as unknown as Map)

      data = chainWithProgress([progressEntry({ fraction: 0.5 })])
      module.sync(map as unknown as Map)

      const drawn = setData.mock.calls.map((c) => c[0] as TripProgressLines)
      const lines = drawn.find((fc) => fc.features.length > 0)
      expect(lines, 'a stub should have been drawn on the new plot').toBeDefined()
    })
  })

  // These sit beside the route-line and station-dot cases above rather than in
  // a module of their own, because that is where the code sits: this module
  // already receives the routes and the plot, already owns the line the stub
  // runs along and the dots it sits between, and already re-applies on a change
  // of reach — which is exactly when a stub moves.
  describe('trip progress', () => {
    it('adds a dashed line layer and a cap between the route line and the station dots', () => {
      const map = makeMockMap()
      useRouteLayer(
        map as Map,
        [route],
        [station],
        chainWithProgress([progressEntry({ fraction: 0.5 })]),
        '#f28f29',
      )

      const ids = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => (c[0] as { id: string }).id,
      )
      expect(ids).toEqual([
        ROUTE_LINE_LAYER_ID,
        RIDDEN_LINE_LAYER_ID,
        PROGRESS_LINE_LAYER_ID,
        PROGRESS_CAP_LAYER_ID,
        STATION_DOTS_LAYER_ID,
      ])

      const stub = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => (c[0] as { id: string }).id === PROGRESS_LINE_LAYER_ID,
      )?.[0]
      // Dashed ink at the ridden width: the grey network shows through the gaps,
      // so a leg half ridden reads as half of each state. A solid overlay would
      // make the one leg nobody completes read as ridden.
      expect(stub.paint['line-dasharray']).toBeDefined()
      expect(stub.paint['line-color']).toBe('#121212')
      expect(stub.paint['line-width']).toBe(RIDDEN_LINE_WIDTH)
    })

    it('draws the alignment sliced to the fraction, not a chord between stations', () => {
      const lines = tripProgressLines([progressRoute], [progressEntry({ fraction: 0.5 })])
      expect(lines.features).toHaveLength(1)

      const drawn = lines.features[0].geometry.coordinates as [number, number][]
      // Starts at the station the rider left, and keeps the vertex the span
      // crosses — a chord would be two points.
      expect(drawn[0]).toEqual([-122.0, 37.0])
      expect(drawn.length).toBeGreaterThan(2)

      // Half of a span running the whole line lands partway along the middle
      // leg, which runs due east at 37.2 — so the cut is strictly between that
      // leg's two ends rather than at either of them.
      const end = drawn[drawn.length - 1]
      expect(end[1]).toBeCloseTo(37.2, 9)
      expect(end[0]).toBeGreaterThan(-122.0)
      expect(end[0]).toBeLessThan(-121.8)
    })

    it('puts the cap at the point the budget ran out', () => {
      const lines = tripProgressLines([progressRoute], [progressEntry({ fraction: 0.5 })])
      const caps = tripProgressCaps(lines)
      const drawn = lines.features[0].geometry.coordinates as [number, number][]
      expect(caps.features).toHaveLength(1)
      expect(caps.features[0].geometry.coordinates).toEqual(drawn[drawn.length - 1])
    })

    it('adds nothing when the plot carries no progress', () => {
      expect(tripProgressLines([progressRoute], undefined).features).toHaveLength(0)
      expect(tripProgressLines([progressRoute], []).features).toHaveLength(0)
    })

    // A hop whose route is not among the ones this map holds cannot be drawn.
    // Progress is decoration: the rest of the map must still render, so the
    // entry is skipped rather than thrown on.
    it('skips a hop whose route cannot be resolved rather than throwing', () => {
      const entries = [progressEntry({ fraction: 0.5, route_id: 'nowhere' }), progressEntry({ fraction: 0.5 })]
      expect(() => tripProgressLines([progressRoute], entries)).not.toThrow()
      expect(tripProgressLines([progressRoute], entries).features).toHaveLength(1)
    })

    it('draws nothing for a zero fraction or a degenerate span', () => {
      expect(tripProgressLines([progressRoute], [progressEntry({ fraction: 0 })]).features).toHaveLength(0)
      expect(
        tripProgressLines([progressRoute], [
          progressEntry({ fraction: 0.5, from_chainage_m: 5000, to_chainage_m: 5000 }),
        ]).features,
      ).toHaveLength(0)
    })

    // There is no fraction floor. Any floor would recreate at a smaller scale
    // the very fault this feature fixes, and a floor expressed as a fraction
    // means wildly different things on a 400 km hop and an 800 m one.
    it('draws a very short stub rather than suppressing it', () => {
      const lines = tripProgressLines([progressRoute], [progressEntry({ fraction: 0.001 })])
      expect(lines.features).toHaveLength(1)
    })

    it('carries the leg it describes onto the feature, so a stub can be identified', () => {
      const lines = tripProgressLines([progressRoute], [progressEntry({ fraction: 0.5 })])
      expect(lines.features[0].properties).toMatchObject({ from: 'a', to: 'b' })
    })
  })
})
