import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import {
  useOriginWalkLayer,
  originWalkModule,
  originWalkLine,
  pickStarterStation,
  ORIGIN_WALK_SOURCE_ID,
  ORIGIN_WALK_LAYER_ID,
} from './useOriginWalkLayer'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'
import type { ChainResponse, ReachableStation } from '../fixtures/isochrone'
import type { Station } from '../api/scenarios'

function makeMockMap() {
  const sources: Record<string, { setData: ReturnType<typeof vi.fn> }> = {}
  const addSource = vi.fn((id: string) => {
    sources[id] = { setData: vi.fn() }
  })
  const getSource = vi.fn((id: string) => sources[id])
  return {
    addSource,
    addLayer: vi.fn(),
    getSource,
    sources,
  }
}

function station(slug: string, lng: number, lat: number): Station {
  return {
    id: `id-${slug}`,
    scenario_id: 's1',
    slug,
    name: slug,
    location: { type: 'Point', coordinates: [lng, lat] },
    platform_height: 'high',
  }
}

function reachable(
  slug: string,
  accessMins: number,
  viaService?: string,
): ReachableStation {
  return {
    station_slug: slug,
    access_mins: accessMins,
    remaining_mins: 10,
    ...(viaService ? { via_service: viaService } : {}),
  }
}

function response(stations: ReachableStation[]): ChainResponse {
  return {
    type: 'FeatureCollection',
    features: [],
    metadata: {
      reachable_stations: stations,
      origin_budget_mins: 90,
      scenario_slug: 'ca-hsr',
      mode: 'walk',
      wait_model: 'none',
      origin_iso_available: true,
    },
  }
}

const ORIGIN = { lat: 37.4, lng: -121.9 }
const STATIONS = [station('sf', -122.39, 37.79), station('san-jose', -121.9, 37.33)]

describe('pickStarterStation', () => {
  it('picks the station reached without boarding any service', () => {
    const picked = pickStarterStation([
      reachable('sf', 4, 'svc-1'),
      reachable('san-jose', 22),
    ])
    expect(picked?.station_slug).toBe('san-jose')
  })

  it('picks the nearest walk when several stations were reached on foot', () => {
    const picked = pickStarterStation([
      reachable('sf', 31),
      reachable('san-jose', 22),
      reachable('gilroy', 47),
    ])
    expect(picked?.station_slug).toBe('san-jose')
  })

  it('returns null when every station was reached by riding', () => {
    expect(
      pickStarterStation([reachable('sf', 4, 'svc-1'), reachable('gilroy', 9, 'svc-2')]),
    ).toBeNull()
  })

  it('returns null for an empty reachable list', () => {
    expect(pickStarterStation([])).toBeNull()
  })

  // Whole-minute access times tie often, and the same plot must not draw a
  // different line depending on the order the worker listed the stations in.
  it('breaks a tie on the slug, whichever order the stations arrive in', () => {
    const tied = [reachable('san-jose', 22), reachable('gilroy', 22), reachable('sf', 22)]
    expect(pickStarterStation(tied)?.station_slug).toBe('gilroy')
    expect(pickStarterStation([...tied].reverse())?.station_slug).toBe('gilroy')
  })
})

describe('originWalkLine', () => {
  it('draws a line from the origin to the starter station', () => {
    const line = originWalkLine(ORIGIN, response([reachable('san-jose', 22)]), STATIONS)
    expect(line?.features).toHaveLength(1)
    expect(line?.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [-121.9, 37.4],
        [-121.9, 37.33],
      ],
    })
  })

  it('labels the line with the station it walks to and the walk it represents', () => {
    const line = originWalkLine(ORIGIN, response([reachable('san-jose', 22)]), STATIONS)
    expect(line?.features[0].properties).toEqual({
      station_slug: 'san-jose',
      access_mins: 22,
    })
  })

  it('is null without an origin', () => {
    expect(originWalkLine(null, response([reachable('san-jose', 22)]), STATIONS)).toBeNull()
  })

  it('is null without an isochrone', () => {
    expect(originWalkLine(ORIGIN, null, STATIONS)).toBeNull()
  })

  it('is null when no station was reached on foot', () => {
    expect(originWalkLine(ORIGIN, response([reachable('sf', 4, 'svc-1')]), STATIONS)).toBeNull()
  })

  // The reachable list names slugs; only the scenario's own station list says
  // where they are. Without it there is nothing to draw a line to.
  it('is null when the starter station is not among the scenario stations', () => {
    expect(originWalkLine(ORIGIN, response([reachable('elsewhere', 22)]), STATIONS)).toBeNull()
  })
})

describe('useOriginWalkLayer', () => {
  it('registers a geojson source seeded with the line', () => {
    const map = makeMockMap()
    const line = originWalkLine(ORIGIN, response([reachable('san-jose', 22)]), STATIONS)!
    useOriginWalkLayer(map as unknown as Map, line)
    expect(map.addSource).toHaveBeenCalledWith(ORIGIN_WALK_SOURCE_ID, {
      type: 'geojson',
      data: line,
    })
  })

  it('adds a dashed line layer in the origin colour', () => {
    const map = makeMockMap()
    const line = originWalkLine(ORIGIN, response([reachable('san-jose', 22)]), STATIONS)!
    useOriginWalkLayer(map as unknown as Map, line)
    const layer = map.addLayer.mock.calls[0][0]
    expect(layer.id).toBe(ORIGIN_WALK_LAYER_ID)
    expect(layer.type).toBe('line')
    expect(layer.source).toBe(ORIGIN_WALK_SOURCE_ID)
    expect(layer.paint['line-color']).toBe(THEME_TOKEN_FALLBACKS['--color-data-origin'])
    expect(layer.paint['line-dasharray']).toBeDefined()
  })

  it('paints with a caller-supplied colour', () => {
    const map = makeMockMap()
    const line = originWalkLine(ORIGIN, response([reachable('san-jose', 22)]), STATIONS)!
    useOriginWalkLayer(map as unknown as Map, line, '#123456')
    expect(map.addLayer.mock.calls[0][0].paint['line-color']).toBe('#123456')
  })
})

describe('originWalkModule', () => {
  const WALKED_TO_SAN_JOSE = response([reachable('san-jose', 22)])
  const ALL_RIDDEN = response([reachable('sf', 4, 'svc-1')])

  // A mutable stand-in for the props MapView reads these off.
  function inputsFor(data: ChainResponse, origin = ORIGIN) {
    const state = { origin, data, stations: STATIONS }
    return {
      state,
      inputs: {
        origin: () => state.origin,
        data: () => state.data,
        stations: () => state.stations,
      },
    }
  }

  it('waits for the style even once there is a line to draw', () => {
    const { inputs } = inputsFor(WALKED_TO_SAN_JOSE)
    expect(originWalkModule(inputs, '#123456').isReady(false)).toBe(false)
  })

  it('stays unattached while there is no walked-to station', () => {
    const { inputs } = inputsFor(ALL_RIDDEN)
    expect(originWalkModule(inputs, '#123456').isReady(true)).toBe(false)
  })

  it('is ready once the style is up and a station was walked to', () => {
    const { inputs } = inputsFor(WALKED_TO_SAN_JOSE)
    expect(originWalkModule(inputs, '#123456').isReady(true)).toBe(true)
  })

  it('attaches the source and layer', () => {
    const map = makeMockMap()
    const { inputs } = inputsFor(WALKED_TO_SAN_JOSE)
    originWalkModule(inputs, '#123456').attach(map as unknown as Map)
    expect(map.addSource).toHaveBeenCalledOnce()
    expect(map.addLayer).toHaveBeenCalledOnce()
  })

  it('re-plotting to a different station rewrites the same source', () => {
    const map = makeMockMap()
    const { state, inputs } = inputsFor(WALKED_TO_SAN_JOSE)
    const module = originWalkModule(inputs, '#123456')
    module.attach(map as unknown as Map)
    state.data = response([reachable('sf', 31)])
    module.sync(map as unknown as Map)
    const drawn = map.sources[ORIGIN_WALK_SOURCE_ID].setData.mock.calls[0][0]
    expect(drawn.features[0].properties.station_slug).toBe('sf')
  })

  // A later plot with no walk-only station must not leave the previous plot's
  // line standing over an origin it no longer belongs to.
  it('clears the line when a later plot has no walked-to station', () => {
    const map = makeMockMap()
    const { state, inputs } = inputsFor(WALKED_TO_SAN_JOSE)
    const module = originWalkModule(inputs, '#123456')
    module.attach(map as unknown as Map)
    state.data = ALL_RIDDEN
    module.sync(map as unknown as Map)
    const drawn = map.sources[ORIGIN_WALK_SOURCE_ID].setData.mock.calls[0][0]
    expect(drawn.features).toEqual([])
  })

  // The origin moves under a live coordinate form; the plot does not. Watching
  // it would drag the line off the plot it belongs to.
  it('does not watch the origin, only the plot and the station list', () => {
    const { state, inputs } = inputsFor(WALKED_TO_SAN_JOSE)
    const module = originWalkModule(inputs, '#123456')
    const before = module.deps()
    state.origin = { lat: 38.9, lng: -120.1 }
    expect(module.deps()).toEqual(before)
  })
})
