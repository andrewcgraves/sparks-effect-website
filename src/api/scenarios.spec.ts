import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchScenarioRoutes, fetchScenarioStations, type Route, type Station } from './scenarios'

describe('fetchScenarioRoutes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('fetches from the correct routes endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    await fetchScenarioRoutes('ca-hsr')
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/scenarios/ca-hsr/routes')
  })

  it('uses VITE_API_BASE_URL when set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://custom-api:9000')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    await fetchScenarioRoutes('ca-hsr')
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('http://custom-api:9000')
  })

  it('returns the parsed route array', async () => {
    const route: Route = {
      id: 'r1',
      scenario_id: 's1',
      name: 'Main Line',
      mode: 'hsr',
      geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
      bidirectional: true,
    }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [route] } as Response)
    const result = await fetchScenarioRoutes('ca-hsr')
    expect(result).toEqual([route])
  })

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    await expect(fetchScenarioRoutes('ca-hsr')).rejects.toThrow()
  })
})

describe('fetchScenarioStations', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('fetches from the correct stations endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    await fetchScenarioStations('ca-hsr')
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/scenarios/ca-hsr/stations')
  })

  it('returns the parsed station array', async () => {
    const station: Station = {
      id: 'st1',
      scenario_id: 's1',
      slug: 'sf',
      name: 'San Francisco',
      location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      platform_height: 0,
    }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [station] } as Response)
    const result = await fetchScenarioStations('ca-hsr')
    expect(result).toEqual([station])
  })

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    await expect(fetchScenarioStations('ca-hsr')).rejects.toThrow()
  })
})
