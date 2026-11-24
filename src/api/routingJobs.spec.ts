// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKLOG_FULL_CODE,
  enqueueIsochrone,
  fetchRoutingJob,
  ISOCHRONE_DEADLINE_MS,
  ROUTING_JOB_STALE_AFTER_MS,
  RoutingBusyError,
  routingBusyWait,
  type IsochroneParams,
  type RoutingJob,
} from './routingJobs'
import { JobFailedError, JobTimedOutError } from './polling'
import { ApiError } from './authoring/client'
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

  it('sends a caller-supplied X-Trace-Id rather than minting a new one', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(polled({ status: 'running' }))

    await fetchRoutingJob('rj1', { headers: { 'X-Trace-Id': 'job-trace' } })

    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers)
    expect(headers.get('X-Trace-Id')).toBe('job-trace')
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

  // SPA-230: a routing job failed by the API — the routing service being
  // down, chief among the reasons — must reject with a JobFailedError carrying
  // that reason on its own field, not just folded into the log-style message,
  // so a caller can log the reason it maps to copy.
  it('rejects with a JobFailedError carrying the API error text', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled({
        status: 'failed',
        error: "The routing service isn't responding right now. Please try again in a few minutes.",
      }))

    const promise = enqueueIsochrone('/api/isochrone', params)
    // Attached before the timer advance (rather than via try/await) so the
    // rejection always has a handler by the time it fires — an awaited
    // try/catch here still leaves a tick where it does not.
    const settled = promise.catch((err: unknown) => err)

    await vi.advanceTimersByTimeAsync(0)

    const err = await settled
    expect(err).toBeInstanceOf(JobFailedError)
    expect((err as JobFailedError).jobError).toBe(
      "The routing service isn't responding right now. Please try again in a few minutes.",
    )
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

  // Past the deadline the job has waited longer than the API's own stale
  // limit, so the reason is the queue, not the job: it rejects as busy.
  it('gives up at the deadline rather than polling a queued job forever', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValue(polled({ status: 'queued' }))

    const promise = enqueueIsochrone('/api/isochrone', params)
    const settled = expect(promise).rejects.toBeInstanceOf(RoutingBusyError)

    await vi.advanceTimersByTimeAsync(ISOCHRONE_DEADLINE_MS + 1000)

    await settled
  })

  // The API fails a job unfinished 90 seconds after it was created; one that
  // fails that late waited out the queue rather than being refused.
  it('rejects as busy when the job fails after waiting out the stale limit', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockImplementation(async () =>
        Date.now() - start >= ROUTING_JOB_STALE_AFTER_MS
          ? polled({ status: 'failed', error: 'stale' })
          : polled({ status: 'queued', queue_position: 40 }),
      )
    const start = Date.now()

    const promise = enqueueIsochrone('/api/isochrone', params)
    const settled = expect(promise).rejects.toBeInstanceOf(RoutingBusyError)

    await vi.advanceTimersByTimeAsync(ROUTING_JOB_STALE_AFTER_MS + 1000)

    await settled
  })

  it('reports how long the visitor has waited with each poll', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled({ status: 'queued', queue_position: 3 }))
      .mockResolvedValueOnce(polled({ status: 'succeeded', result: stubChain }))
    const onProgress = vi.fn()

    const promise = enqueueIsochrone('/api/isochrone', params, onProgress)
    await vi.advanceTimersByTimeAsync(1000)
    await promise

    expect(onProgress.mock.calls.map(([progress]) => progress.waitedMs)).toEqual([0, 1000])
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
    const settled = expect(promise).rejects.toBeInstanceOf(RoutingBusyError)

    await vi.advanceTimersByTimeAsync(0)

    await settled
    // One poll, then out of budget — not a second full deadline's worth.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })

  // SPA-205: an isochrone is one logical job, not one HTTP call. The enqueue
  // and every poll share an X-Trace-Id so grepping logs for that id
  // reconstructs the whole wait — not just the POST whose id reaches the
  // routing worker.
  it('reuses one X-Trace-Id across the enqueue and every poll', async () => {
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

    const ids = vi.mocked(fetch).mock.calls.map(([, init]) => new Headers(init?.headers).get('X-Trace-Id'))
    expect(ids).toHaveLength(4)
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Set(ids).size).toBe(1)
  })

  // SPA-467: the wait is told to the visitor as it happens, so every poll's
  // place in the queue reaches the caller — including a queued poll that
  // carries no position, which the API sends when it could not count.
  it('reports the status and queue position of every poll to onProgress', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled({ status: 'queued', queue_position: 2 }))
      .mockResolvedValueOnce(polled({ status: 'queued', queue_position: 1 }))
      .mockResolvedValueOnce(polled({ status: 'queued' }))
      .mockResolvedValueOnce(polled({ status: 'running' }))
      .mockResolvedValueOnce(polled({ status: 'succeeded', result: stubChain }))
    const onProgress = vi.fn()

    const promise = enqueueIsochrone('/api/isochrone', params, onProgress)
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000)
    await promise

    expect(onProgress.mock.calls.map(([{ status, queue_position }]) => ({ status, queue_position }))).toEqual([
      { status: 'queued', queue_position: 2 },
      { status: 'queued', queue_position: 1 },
      { status: 'queued', queue_position: undefined },
      { status: 'running', queue_position: undefined },
      { status: 'succeeded', queue_position: undefined },
    ])
  })

  it('mints a different X-Trace-Id for each enqueued job', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled({ status: 'succeeded', result: stubChain }))
      .mockResolvedValueOnce(enqueued())
      .mockResolvedValueOnce(polled({ status: 'succeeded', result: stubChain }))

    await enqueueIsochrone('/api/isochrone', params)
    await enqueueIsochrone('/api/isochrone', params)

    const first = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('X-Trace-Id')
    const second = new Headers(vi.mocked(fetch).mock.calls[2][1]?.headers).get('X-Trace-Id')
    expect(first).not.toBe(second)
  })
})

describe('routingBusyWait', () => {
  // SPA-467: the API says how long the backlog will take to clear, so a refused
  // visitor is told when to come back.
  it('quotes the Retry-After seconds when a backlog_full refusal carries them', () => {
    const refused = (retryAfterS: number) =>
      new ApiError('POST /api/isochrone failed: 429', 429, BACKLOG_FULL_CODE, undefined, retryAfterS)

    expect(routingBusyWait(refused(30))).toBe('30 seconds')
    expect(routingBusyWait(refused(1))).toBe('1 second')
  })

  it('says a few minutes for a refusal without Retry-After or a job given up on', () => {
    expect(routingBusyWait(new ApiError('POST /api/isochrone failed: 429', 429, BACKLOG_FULL_CODE))).toBe(
      'a few minutes',
    )
    expect(routingBusyWait(new RoutingBusyError(new JobTimedOutError('rj1', 120_000)))).toBe('a few minutes')
  })

  it('returns null for anything else, so a caller can chain it', () => {
    expect(routingBusyWait(new ApiError('nope', 500))).toBeNull()
    expect(routingBusyWait(new ApiError('nope', 422, 'origin_out_of_range'))).toBeNull()
    expect(routingBusyWait(new JobFailedError('rj1', 'no route'))).toBeNull()
    expect(routingBusyWait(new Error('offline'))).toBeNull()
    expect(routingBusyWait(null)).toBeNull()
  })

  // A bare 429 with no code could be an edge rate limiter or a proxy in front
  // of the API — a different situation, and not one this message describes.
  it('returns null for a 429 that does not carry the code', () => {
    expect(routingBusyWait(new ApiError('POST /api/isochrone failed: 429', 429))).toBeNull()
  })
})
