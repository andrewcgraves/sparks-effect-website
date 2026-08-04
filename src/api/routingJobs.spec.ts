import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueIsochrone,
  fetchRoutingJob,
  ISOCHRONE_DEADLINE_MS,
  type IsochroneParams,
  type RoutingJob,
} from './routingJobs'
import type { ChainResponse } from '../fixtures/isochrone'

const stubChain = {
  type: 'FeatureCollection',
  features: [],
  metadata: {},
} as unknown as ChainResponse

const params: IsochroneParams = { lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk' }

function routingJob(overrides: Partial<RoutingJob> = {}): RoutingJob {
  return {
    id: 'rj1',
    status: 'queued',
    compile_job_id: 'job1',
    ...params,
    ...overrides,
  }
}

// The 202 the isochrone endpoints answer with, and the 200s the poll reads.
function enqueued(): Response {
  return { ok: true, status: 202, json: async () => routingJob() } as Response
}

function polled(overrides: Partial<RoutingJob>): Response {
  return { ok: true, status: 200, json: async () => routingJob(overrides) } as Response
}

describe('fetchRoutingJob', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('GETs /api/routing-jobs/{id} and returns the parsed job', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(polled({ status: 'running' }))

    const result = await fetchRoutingJob('rj1')

    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/routing-jobs/rj1')
    expect(result).toEqual(routingJob({ status: 'running' }))
  })
})

describe('enqueueIsochrone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('POSTs the request to the path it is given', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled({ status: 'succeeded', result: stubChain }))

    await enqueueIsochrone('/api/isochrone', params)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/isochrone')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(params)
  })

  it('polls the routing job the enqueue answered with, until it succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled({ status: 'queued' }))
      .mockResolvedValueOnce(polled({ status: 'running' }))
      .mockResolvedValueOnce(polled({ status: 'succeeded', result: stubChain }))

    const promise = enqueueIsochrone('/api/isochrone', params)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(promise).resolves.toEqual(stubChain)
    expect(vi.mocked(fetch).mock.calls[1][0]).toContain('/api/routing-jobs/rj1')
  })

  it('rejects when the job fails, including the error the worker reported', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled({ status: 'failed', error: 'valhalla unreachable' }))

    const promise = enqueueIsochrone('/api/isochrone', params)
    const settled = expect(promise).rejects.toThrow(/valhalla unreachable/)

    await vi.advanceTimersByTimeAsync(0)

    await settled
  })

  it('rejects when the job succeeds without a result', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled({ status: 'succeeded' }))

    const promise = enqueueIsochrone('/api/isochrone', params)
    const settled = expect(promise).rejects.toThrow(/no result/)

    await vi.advanceTimersByTimeAsync(0)

    await settled
  })

  it('gives up at the deadline rather than polling a queued job forever', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValue(polled({ status: 'queued' }))

    const promise = enqueueIsochrone('/api/isochrone', params)
    const settled = expect(promise).rejects.toThrow(/timed out/)

    await vi.advanceTimersByTimeAsync(ISOCHRONE_DEADLINE_MS + 1000)

    await settled
  })

  // The deadline covers the whole request, so time spent waiting on the enqueue
  // is time the poll no longer has — a slow enqueue is not granted a fresh
  // deadline on top of the one it already spent.
  it('counts the time the enqueue itself took against the deadline', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(async () => {
        await vi.advanceTimersByTimeAsync(ISOCHRONE_DEADLINE_MS)
        return enqueued()
      })
      .mockResolvedValue(polled({ status: 'queued' }))

    const promise = enqueueIsochrone('/api/isochrone', params)
    const settled = expect(promise).rejects.toThrow(/timed out/)

    await vi.advanceTimersByTimeAsync(0)

    await settled
    // One poll, then out of budget — not a second full deadline's worth.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })
})
