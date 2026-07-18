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
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockChainResponse,
    } as Response)

    await fetchIsochrone(validRequest)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/isochrone')
    expect(init?.method).toBe('POST')
  })

  it('sends the request body as JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockChainResponse,
    } as Response)

    await fetchIsochrone(validRequest)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(init?.body as string)).toEqual(validRequest)
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('defaults base URL to http://localhost:8080 when VITE_API_BASE_URL is unset', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockChainResponse,
    } as Response)

    await fetchIsochrone(validRequest)

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/isochrone')
  })

  it('uses VITE_API_BASE_URL when set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockChainResponse,
    } as Response)

    await fetchIsochrone(validRequest)

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.example.com/api/isochrone')
  })

  it('returns the parsed ChainResponse on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockChainResponse,
    } as Response)

    const result = await fetchIsochrone(validRequest)

    expect(result).toEqual(mockChainResponse)
  })

  it('throws an IsochroneApiError carrying the status when the API returns a non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    await expect(fetchIsochrone(validRequest)).rejects.toThrow('500')
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)
    await expect(fetchIsochrone(validRequest)).rejects.toBeInstanceOf(IsochroneApiError)
  })

  it('sets the status property on the thrown IsochroneApiError', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
    } as Response)

    await fetchIsochrone(validRequest).then(
      () => { throw new Error('expected rejection') },
      (err: unknown) => {
        expect(err).toBeInstanceOf(IsochroneApiError)
        expect((err as IsochroneApiError).status).toBe(422)
      },
    )
  })

  it('throws when the network request fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

    await expect(fetchIsochrone(validRequest)).rejects.toThrow('network error')
  })
})
