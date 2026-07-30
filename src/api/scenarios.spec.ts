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
})

describe('fetchFeaturedScenarios', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
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
})
