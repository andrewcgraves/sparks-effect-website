import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchIsochrone, IsochroneApiError, type IsochroneRequest } from './isochrone'
import type { ChainResponse } from '../fixtures/isochrone'

const validRequest: IsochroneRequest = {
  lat: 37.3382,
  lng: -121.8863,
  budget_mins: 90,
  mode: 'walk',
  scenario_slug: 'ca-hsr',
}

const mockChainResponse: ChainResponse = {
  type: 'FeatureCollection',
  features: [],
  metadata: {
    reachable_stations: [],
    origin_budget_mins: 90,
    scenario_slug: 'ca-hsr',
    mode: 'walk',
    wait_model: 'half-headway',
    origin_iso_available: true,
  },
}

// The endpoint answers 202 with a routing job now (SPA-182), so a result takes
// two responses: the enqueue, then a poll. Succeeding on the first poll keeps
// these timer-free — the cadence and deadline are routingJobs.spec's subject.
function enqueueThenSucceed(): void {
  vi.mocked(fetch)
    .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ id: 'rj1' }) } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'rj1', status: 'succeeded', result: mockChainResponse }),
    } as Response)
}

describe('fetchIsochrone', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sends a POST request to /api/isochrone', async () => {
    enqueueThenSucceed()

    await fetchIsochrone(validRequest)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/isochrone')
    expect(init?.method).toBe('POST')
  })

  it('sends the request body as JSON', async () => {
    enqueueThenSucceed()

    await fetchIsochrone(validRequest)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(init?.body as string)).toEqual(validRequest)
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
  })

  it('defaults base URL to http://localhost:8080 when VITE_API_BASE_URL is unset', async () => {
    enqueueThenSucceed()

    await fetchIsochrone(validRequest)

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/isochrone')
  })

  it('uses VITE_API_BASE_URL when set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    enqueueThenSucceed()

    await fetchIsochrone(validRequest)

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.example.com/api/isochrone')
  })

  it('returns the chain the routing job succeeded with', async () => {
    enqueueThenSucceed()

    const result = await fetchIsochrone(validRequest)

    expect(result).toEqual(mockChainResponse)
  })

  it('throws an IsochroneApiError carrying the status when the enqueue is rejected', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)

    await expect(fetchIsochrone(validRequest)).rejects.toThrow('500')
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('sets the status property on the thrown IsochroneApiError', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 422 } as Response)

    await fetchIsochrone(validRequest).then(
      () => { throw new Error('expected rejection') },
      (err: unknown) => {
        expect(err).toBeInstanceOf(IsochroneApiError)
        expect((err as IsochroneApiError).status).toBe(422)
      },
    )
  })

  // A rejected poll is still this request failing, so it is reported the same
  // way a rejected enqueue is rather than as a stray authoring-client error
  // this module's callers have no case for.
  it('reports a rejected poll as an IsochroneApiError carrying the poll status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ id: 'rj1' }) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    await fetchIsochrone(validRequest).then(
      () => { throw new Error('expected rejection') },
      (err: unknown) => {
        expect(err).toBeInstanceOf(IsochroneApiError)
        expect((err as IsochroneApiError).status).toBe(404)
      },
    )
  })

  it('throws when the routing job fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ id: 'rj1' }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'rj1', status: 'failed', error: 'valhalla unreachable' }),
      } as Response)

    await expect(fetchIsochrone(validRequest)).rejects.toThrow(/valhalla unreachable/)
  })

  it('throws when the network request fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

    await expect(fetchIsochrone(validRequest)).rejects.toThrow('network error')
  })
})
