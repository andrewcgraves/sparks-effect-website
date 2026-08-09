import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import {
  useOriginWalkLayer,
  originWalkModule,
  originWalkLine,
  ORIGIN_WALK_SOURCE_ID,
  ORIGIN_WALK_LAYER_ID,
} from './useOriginWalkLayer'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'
import type { ChainResponse, ReachableStation, StarterWalk } from '../fixtures/isochrone'

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

function reachable(slug: string, accessMins: number, viaService?: string): ReachableStation {
  return {
    station_slug: slug,
    access_mins: accessMins,
    remaining_mins: 10,
    ...(viaService ? { via_service: viaService } : {}),
  }
}

// A shape that bends, the way a walk along streets does. A straight segment
// between the same two points would be two positions; this is four.
const ROUTED_TO_SAN_JOSE: StarterWalk = {
  station_slug: 'san-jose',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-121.9012, 37.3981],
      [-121.9012, 37.3602],
      [-121.8994, 37.3418],
      [-121.9026, 37.3301],
    ],
  },
}

const ROUTED_TO_SF: StarterWalk = {
  station_slug: 'sf',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-122.3901, 37.7901],
      [-122.3944, 37.7912],
    ],
  },
}

function response(stations: ReachableStation[], starterWalk?: StarterWalk): ChainResponse {
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
      ...(starterWalk ? { starter_walk: starterWalk } : {}),
    },
  }
}

const WALKED_TO_SAN_JOSE = response([reachable('san-jose', 22)], ROUTED_TO_SAN_JOSE)

describe('originWalkLine', () => {
  // The whole point of SPA-196: what is drawn is the shape that was walked,
  // not a chord across whatever lies between the two points.
  it('draws the routed path the worker measured, bends and all', () => {
    const line = originWalkLine(WALKED_TO_SAN_JOSE)
    expect(line?.features).toHaveLength(1)
    expect(line?.features[0].geometry).toEqual(ROUTED_TO_SAN_JOSE.geometry)
  })

  // Valhalla snaps each end to the nearest routable edge before routing, so the
  // line begins and ends where the timing did rather than at the raw point the
  // user clicked or wherever the station's row sits today.
  it('keeps the routed endpoints rather than rebuilding them', () => {
    const coordinates = originWalkLine(WALKED_TO_SAN_JOSE)!.features[0].geometry.coordinates
    expect(coordinates).toHaveLength(4)
    expect(coordinates[0]).toEqual([-121.9012, 37.3981])
    expect(coordinates[3]).toEqual([-121.9026, 37.3301])
  })

  it('labels the line with the station it walks to and the walk it represents', () => {
    const line = originWalkLine(WALKED_TO_SAN_JOSE)
    expect(line?.features[0].properties).toEqual({
      station_slug: 'san-jose',
      access_mins: 22,
    })
  })

  it('is null without an isochrone', () => {
    expect(originWalkLine(null)).toBeNull()
  })

  // A plot that reached no station on foot has no walking leg, and one whose
  // route call failed has no shape for the leg it had. Either way there is
  // nothing to draw, and the surface is unaffected.
  it('is null when the plot carries no walking leg', () => {
    expect(originWalkLine(response([reachable('sf', 4, 'svc-1')]))).toBeNull()
  })

  // A walk naming a station the plot's own accounting does not list is a
  // response that contradicts itself; drawing from it would put an unlabelled
  // line on the map.
  it('is null when the walk names a station the accounting does not list', () => {
    expect(originWalkLine(response([reachable('sf', 4, 'svc-1')], ROUTED_TO_SAN_JOSE))).toBeNull()
  })
})

describe('useOriginWalkLayer', () => {
  it('registers a geojson source seeded with the line', () => {
    const map = makeMockMap()
    const line = originWalkLine(WALKED_TO_SAN_JOSE)!
    useOriginWalkLayer(map as unknown as Map, line)
    expect(map.addSource).toHaveBeenCalledWith(ORIGIN_WALK_SOURCE_ID, {
      type: 'geojson',
      data: line,
    })
  })

  it('adds a dashed line layer in the origin colour', () => {
    const map = makeMockMap()
    useOriginWalkLayer(map as unknown as Map, originWalkLine(WALKED_TO_SAN_JOSE)!)
    const layer = map.addLayer.mock.calls[0][0]
    expect(layer.id).toBe(ORIGIN_WALK_LAYER_ID)
    expect(layer.type).toBe('line')
    expect(layer.source).toBe(ORIGIN_WALK_SOURCE_ID)
    expect(layer.paint['line-color']).toBe(THEME_TOKEN_FALLBACKS['--color-data-origin'])
    expect(layer.paint['line-dasharray']).toBeDefined()
  })

  it('paints with a caller-supplied colour', () => {
    const map = makeMockMap()
    useOriginWalkLayer(map as unknown as Map, originWalkLine(WALKED_TO_SAN_JOSE)!, '#123456')
    expect(map.addLayer.mock.calls[0][0].paint['line-color']).toBe('#123456')
  })
})

describe('originWalkModule', () => {
  const ALL_RIDDEN = response([reachable('sf', 4, 'svc-1')])

  // A mutable stand-in for the prop MapView reads this off.
  function inputsFor(data: ChainResponse) {
    const state = { data }
    return { state, inputs: { data: () => state.data } }
  }

  it('waits for the style even once there is a line to draw', () => {
    const { inputs } = inputsFor(WALKED_TO_SAN_JOSE)
    expect(originWalkModule(inputs, '#123456').isReady(false)).toBe(false)
  })

  it('stays unattached while the plot carries no walking leg', () => {
    const { inputs } = inputsFor(ALL_RIDDEN)
    expect(originWalkModule(inputs, '#123456').isReady(true)).toBe(false)
  })

  it('is ready once the style is up and there is a walk to draw', () => {
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
    state.data = response([reachable('sf', 31)], ROUTED_TO_SF)
    module.sync(map as unknown as Map)
    const drawn = map.sources[ORIGIN_WALK_SOURCE_ID].setData.mock.calls[0][0]
    expect(drawn.features[0].properties.station_slug).toBe('sf')
    expect(drawn.features[0].geometry).toEqual(ROUTED_TO_SF.geometry)
  })

  // A later plot with no walking leg must not leave the previous plot's line
  // standing over a walk it no longer describes.
  it('clears the line when a later plot has no walking leg', () => {
    const map = makeMockMap()
    const { state, inputs } = inputsFor(WALKED_TO_SAN_JOSE)
    const module = originWalkModule(inputs, '#123456')
    module.attach(map as unknown as Map)
    state.data = ALL_RIDDEN
    module.sync(map as unknown as Map)
    const drawn = map.sources[ORIGIN_WALK_SOURCE_ID].setData.mock.calls[0][0]
    expect(drawn.features).toEqual([])
  })

  // The plot is the only input. The origin moves under a live coordinate form
  // and the station rows move when a scenario is edited; neither changes a walk
  // that has already been routed and timed.
  it('watches the plot and nothing else', () => {
    const { state, inputs } = inputsFor(WALKED_TO_SAN_JOSE)
    const module = originWalkModule(inputs, '#123456')
    expect(module.deps()).toEqual([WALKED_TO_SAN_JOSE])
    state.data = ALL_RIDDEN
    expect(module.deps()).toEqual([ALL_RIDDEN])
  })
})
