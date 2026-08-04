import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  awaitIsochrone,
  fetchRoutingJob,
  ISOCHRONE_DEADLINE_MS,
  type RoutingJob,
} from './routingJobs'
import type { ChainResponse } from '../fixtures/isochrone'

const stubChain = {
  type: 'FeatureCollection',
  features: [],
  metadata: {},
} as unknown as ChainResponse

function routingJob(overrides: Partial<RoutingJob> = {}): RoutingJob {
  return {
    id: 'rj1',
    status: 'queued',
    compile_job_id: 'job1',
    lat: 37.7,
    lng: -122.4,
    budget_mins: 30,
    mode: 'walk',
    ...overrides,
  }
}

function jobResponse(job: RoutingJob): Response {
  return { ok: true, status: 200, json: async () => job } as Response
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
    const job = routingJob({ status: 'running' })
    vi.mocked(fetch).mockResolvedValueOnce(jobResponse(job))

    const result = await fetchRoutingJob('rj1')

    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/routing-jobs/rj1')
    expect(result).toEqual(job)
  })
})

describe('awaitIsochrone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('polls the job until it succeeds and resolves with its result', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jobResponse(routingJob({ status: 'queued' })))
      .mockResolvedValueOnce(jobResponse(routingJob({ status: 'running' })))
      .mockResolvedValueOnce(jobResponse(routingJob({ status: 'succeeded', result: stubChain })))

    const promise = awaitIsochrone(routingJob())

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(promise).resolves.toEqual(stubChain)
  })

  it('rejects when the job fails, including the error the worker reported', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse(routingJob({ status: 'failed', error: 'valhalla unreachable' })),
    )

    const promise = awaitIsochrone(routingJob())
    const settled = expect(promise).rejects.toThrow(/valhalla unreachable/)

    await vi.advanceTimersByTimeAsync(0)

    await settled
  })

  it('rejects when the job succeeds without a result', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jobResponse(routingJob({ status: 'succeeded' })))

    const promise = awaitIsochrone(routingJob())
    const settled = expect(promise).rejects.toThrow(/no result/)

    await vi.advanceTimersByTimeAsync(0)

    await settled
  })

  it('gives up at the deadline rather than polling a queued job forever', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse(routingJob({ status: 'queued' })))

    const promise = awaitIsochrone(routingJob())
    const settled = expect(promise).rejects.toThrow(/timed out/)

    await vi.advanceTimersByTimeAsync(ISOCHRONE_DEADLINE_MS + 1000)

    await settled
  })
})
