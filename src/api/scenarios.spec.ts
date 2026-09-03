// @vitest-environment node
// No DOM in this file. See the environment note in vite.config.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchScenario,
  fetchScenarioTravelTimes,
  fetchFeaturedScenarios,
  FEATURED_SCENARIO_SLUGS,
  type Route,
  type Station,
  type Service,
  type ScenarioDetail,
  type TravelTimes,
} from './scenarios'

vi.mock('./authoring/routes', () => ({
  listRoutes: vi.fn(),
}))

import { listRoutes } from './authoring/routes'
import type { RouteSummary } from './authoring/types'

const stubRoute: Route = {
  id: 'r1',
  scenario_id: 's1',
  name: 'Main Line',
  mode: 'hsr',
  geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
  bidirectional: true,
}

const stubStation: Station = {
  id: 'st1',
  scenario_id: 's1',
  slug: 'sf',
  name: 'San Francisco',
  location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
  platform_height: '0',
}

const stubService: Service = {
  id: 'svc1',
  name: 'Northbound Express',
  vehicle_type: {
    id: 'vt1',
    name: 'High-Speed Rail',
    propulsion: 'electric',
    max_speed_kmh: 320,
  },
  direction: 'northbound',
  provenance: 'calibrated',
  stop_count: 2,
  frequency_windows: [
    { id: 'fw1', service_id: 'svc1', start_time: '06:00', end_time: '22:00', headway_s: 3600 },
  ],
}

const stubDetail: ScenarioDetail = {
  id: 's1',
  slug: 'ca-hsr',
  name: 'CA HSR',
  description: 'California High-Speed Rail',
  status: 'active',
  routes: [stubRoute],
  stations: [stubStation],
  services: [stubService],
}

describe('fetchScenario', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('fetches from the correct scenario endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubDetail } as Response)
    await fetchScenario('ca-hsr')
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/scenarios/ca-hsr')
    expect(calledUrl).not.toContain('/routes')
    expect(calledUrl).not.toContain('/stations')
  })

  it('uses VITE_API_BASE_URL when set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://custom-api:9000')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubDetail } as Response)
    await fetchScenario('ca-hsr')
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('http://custom-api:9000')
  })

  it('returns routes, stations, and services from the parsed response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubDetail } as Response)
    const result = await fetchScenario('ca-hsr')
    expect(result.routes).toEqual([stubRoute])
    expect(result.stations).toEqual([stubStation])
    expect(result.services).toEqual([stubService])
  })

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    await expect(fetchScenario('ca-hsr')).rejects.toThrow()
  })

  it('sends a X-Trace-Id header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubDetail } as Response)
    await fetchScenario('ca-hsr')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('X-Trace-Id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

const stubTravelTimes: TravelTimes = {
  scenario_slug: 'ca-hsr',
  provenance: 'calibrated',
  source: 'seed',
  segments: [{ from: 'sf', to: 'sj', run_seconds: 1800 }],
}

describe('fetchScenarioTravelTimes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('fetches from the travel-times endpoint for the scenario', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubTravelTimes } as Response)
    await fetchScenarioTravelTimes('ca-hsr')
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/scenarios/ca-hsr/travel-times')
  })

  it('returns the parsed segments', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubTravelTimes } as Response)
    const result = await fetchScenarioTravelTimes('ca-hsr')
    expect(result.segments).toEqual([{ from: 'sf', to: 'sj', run_seconds: 1800 }])
  })

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    await expect(fetchScenarioTravelTimes('ca-hsr')).rejects.toThrow()
  })

  it('sends a X-Trace-Id header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubTravelTimes } as Response)
    await fetchScenarioTravelTimes('ca-hsr')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('X-Trace-Id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('fetchFeaturedScenarios', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(listRoutes).mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('returns a summary for each featured slug that resolves', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => stubDetail } as Response)
    const result = await fetchFeaturedScenarios()
    expect(result).toEqual(
      FEATURED_SCENARIO_SLUGS.map(() => ({
        slug: stubDetail.slug,
        name: stubDetail.name,
        description: stubDetail.description,
      })),
    )
  })

  it('omits a featured slug whose fetch fails, without throwing', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)
    const result = await fetchFeaturedScenarios()
    expect(result).toEqual([])
  })

  it('also resolves scenarios for every published route slug from listRoutes', async () => {
    const routeSummaries: RouteSummary[] = [{ slug: 'other-line', name: 'Other Line', mode: 'rail' }]
    vi.mocked(listRoutes).mockResolvedValue(routeSummaries)
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/api/scenarios/other-line')) {
        return { ok: true, json: async () => ({ ...stubDetail, slug: 'other-line', name: 'Other Line' }) } as Response
      }
      return { ok: true, json: async () => stubDetail } as Response
    })
    const result = await fetchFeaturedScenarios()
    expect(result.map((summary) => summary.slug)).toEqual(expect.arrayContaining(['ca-hsr', 'other-line']))
  })

  it('does not fetch the same scenario slug twice when a route shares a featured slug', async () => {
    vi.mocked(listRoutes).mockResolvedValue([{ slug: 'ca-hsr', name: 'Main Line', mode: 'hsr' }])
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => stubDetail } as Response)
    await fetchFeaturedScenarios()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('still returns the featured scenarios when listRoutes fails', async () => {
    vi.mocked(listRoutes).mockRejectedValue(new Error('boom'))
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => stubDetail } as Response)
    const result = await fetchFeaturedScenarios()
    expect(result).toEqual([{ slug: stubDetail.slug, name: stubDetail.name, description: stubDetail.description }])
  })
})
