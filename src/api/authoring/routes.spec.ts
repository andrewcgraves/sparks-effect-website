import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRoute, listRoutes, snapStops } from './routes'
import type { Route, RouteSummary, SnapStopsResponse } from './types'

const stubRoute: Route = {
  id: 'rt1',
  slug: 'main-line',
  name: 'Main Line',
  mode: 'rail',
  bidirectional: true,
  geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
  segments: [
    { cant_mm: 150, curve_radius_m: 1200, grade_pct: 1.2 },
  ],
}

describe('fetchRoute', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('hits the route endpoint and returns the parsed route', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubRoute } as Response)
    const result = await fetchRoute('main-line')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/routes/main-line')
    expect(result).toEqual(stubRoute)
    expect(result.segments[0].curve_radius_m).toBe(1200)
  })

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)
    await expect(fetchRoute('nope')).rejects.toThrow()
  })
})

describe('listRoutes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('GETs /api/routes and returns the parsed summaries', async () => {
    const stubSummaries: RouteSummary[] = [{ slug: 'main-line', name: 'Main Line', mode: 'rail' }]
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubSummaries } as Response)
    const result = await listRoutes()
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/routes')
    expect((init as RequestInit | undefined)?.method ?? 'GET').toBe('GET')
    expect(result).toEqual(stubSummaries)
  })
})

describe('snapStops', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('POSTs the raw stops to the snap-stops preview endpoint', async () => {
    const stubResponse: SnapStopsResponse = {
      route_slug: 'main-line',
      off_route_threshold_m: 500,
      stops: [
        {
          input: { lat: 37.77, lng: -122.41 },
          snapped: { lat: 37.771, lng: -122.409 },
          chainage_m: 120,
          offset_m: 12,
          off_route: false,
        },
      ],
      chainage_order: [0],
      order_is_consistent: true,
    }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubResponse } as Response)

    const result = await snapStops('main-line', [{ lat: 37.77, lng: -122.41 }])

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/routes/main-line/snap-stops')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      stops: [{ lat: 37.77, lng: -122.41 }],
    })
    expect(result).toEqual(stubResponse)
  })
})
