// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setAuthTokenProvider } from './authoring/client'
import {
  fetchScenario,
  fetchScenarioTravelTimes,
  listCuratedScenarios,
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
    setAuthTokenProvider(null)
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

  // SPA-290: a plain Error is what every fault-narrowing function in the app
  // rejects on its first line, so this endpoint could not reach any of them.
  // An ApiError carries the status and the API's own words instead. This route
  // refuses one way only — a code-less `scenario not found` — so there is no
  // code here to read, and none is invented.
  it('throws an ApiError carrying the status and message of a refusal', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'scenario not found' }),
    } as Response)

    const err = await fetchScenario('ca-hsr').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
    expect((err as ApiError).message).toContain('scenario not found')
    expect((err as ApiError).code).toBeUndefined()
    expect((err as ApiError).detail).toBeUndefined()
  })

  // These reads are public, but they are on the shared client now, so a
  // signed-in reader's session token rides along as it does everywhere else.
  // The API ignores it on this route; pinned so a change either way is a
  // decision rather than a surprise.
  it('sends the ambient session token', async () => {
    setAuthTokenProvider(() => 'tok-1')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubDetail } as Response)
    await fetchScenario('ca-hsr')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-1')
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

  it('throws an ApiError carrying the status when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'scenario not found' }),
    } as Response)

    const err = await fetchScenarioTravelTimes('ca-hsr').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
  })

  it('sends a X-Trace-Id header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubTravelTimes } as Response)
    await fetchScenarioTravelTimes('ca-hsr')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('X-Trace-Id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('listCuratedScenarios', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the curated list rather than guessing slugs', async () => {
    const curated = [{ slug: 'ca-hsr', name: 'CA HSR', description: 'California High-Speed Rail' }]
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => curated } as Response)

    const result = await listCuratedScenarios()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(new URL(vi.mocked(fetch).mock.calls[0][0] as string).pathname).toBe('/api/scenarios')
    expect(result).toEqual(curated)
  })

  it('rejects when the read fails, rather than answering an empty list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    await expect(listCuratedScenarios()).rejects.toBeInstanceOf(ApiError)
  })
})
