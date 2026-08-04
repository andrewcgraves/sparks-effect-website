import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchIsochrone, IsochroneApiError, type IsochroneRequest } from './isochrone'
import { ISOCHRONE_DEADLINE_MS, type RoutingJob } from './routingJobs'
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

function routingJob(overrides: Partial<RoutingJob> = {}): RoutingJob {
  return {
    id: 'rj1',
    status: 'queued',
    compile_job_id: 'job1',
    lat: validRequest.lat,
    lng: validRequest.lng,
    budget_mins: validRequest.budget_mins,
    mode: validRequest.mode,
    ...overrides,
  }
}

// The 202 the enqueue answers with, and the 200s the poll reads afterwards.
function enqueued(job: RoutingJob = routingJob()): Response {
  return { ok: true, status: 202, json: async () => job } as Response
}

function polled(job: RoutingJob): Response {
  return { ok: true, status: 200, json: async () => job } as Response
}

// The common case: enqueued, then succeeded on the very first poll, so no timer
// has to be advanced to reach the result.
function succeedsImmediately(): void {
  vi.mocked(fetch)
    .mockResolvedValueOnce(enqueued())
    .mockResolvedValueOnce(polled(routingJob({ status: 'succeeded', result: mockChainResponse })))
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
    succeedsImmediately()

    await fetchIsochrone(validRequest)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/isochrone')
    expect(init?.method).toBe('POST')
  })

  it('sends the request body as JSON', async () => {
    succeedsImmediately()

    await fetchIsochrone(validRequest)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(init?.body as string)).toEqual(validRequest)
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
  })

  it('defaults base URL to http://localhost:8080 when VITE_API_BASE_URL is unset', async () => {
    succeedsImmediately()

    await fetchIsochrone(validRequest)

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/isochrone')
  })

  it('uses VITE_API_BASE_URL when set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    succeedsImmediately()

    await fetchIsochrone(validRequest)

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.example.com/api/isochrone')
  })

  it('polls the routing job the enqueue answered with', async () => {
    succeedsImmediately()

    await fetchIsochrone(validRequest)

    const [url] = vi.mocked(fetch).mock.calls[1]
    expect(url).toContain('/api/routing-jobs/rj1')
  })

  it('returns the chain the routing job succeeded with', async () => {
    succeedsImmediately()

    const result = await fetchIsochrone(validRequest)

    expect(result).toEqual(mockChainResponse)
  })

  it('throws an IsochroneApiError carrying the status when the enqueue is rejected', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)

    await expect(fetchIsochrone(validRequest)).rejects.toBeInstanceOf(IsochroneApiError)
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

  // A rejected poll is still the isochrone request failing, so it is reported
  // the same way a rejected enqueue is rather than as a stray authoring-client
  // error this module's callers have no case for.
  it('reports a rejected poll as an IsochroneApiError carrying the poll status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
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
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled(routingJob({ status: 'failed', error: 'valhalla unreachable' })))

    await expect(fetchIsochrone(validRequest)).rejects.toThrow(/valhalla unreachable/)
  })

  it('throws when the network request fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

    await expect(fetchIsochrone(validRequest)).rejects.toThrow('network error')
  })
})

describe('fetchIsochrone deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('waits across polls for a job that is still queued', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled(routingJob({ status: 'queued' })))
      .mockResolvedValueOnce(polled(routingJob({ status: 'running' })))
      .mockResolvedValueOnce(polled(routingJob({ status: 'succeeded', result: mockChainResponse })))

    const promise = fetchIsochrone(validRequest)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(promise).resolves.toEqual(mockChainResponse)
  })

  it('fails rather than spinning forever on a job that never leaves the queue', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValue(polled(routingJob({ status: 'queued' })))

    const promise = fetchIsochrone(validRequest)
    const settled = expect(promise).rejects.toThrow(/timed out/)

    await vi.advanceTimersByTimeAsync(ISOCHRONE_DEADLINE_MS + 1000)

    await settled
  })
})
