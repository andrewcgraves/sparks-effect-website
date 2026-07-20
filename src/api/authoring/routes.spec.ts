import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRoute } from './routes'
import type { Route } from './types'

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
