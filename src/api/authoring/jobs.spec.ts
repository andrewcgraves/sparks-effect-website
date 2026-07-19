import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchJob, pollJobToResult } from './jobs'
import type { Job } from './types'

function jobResponse(job: Job): Response {
  return { ok: true, status: 200, json: async () => job } as Response
}

describe('fetchJob', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('GETs /api/jobs/{jobId} and returns the parsed job', async () => {
    const job: Job = { id: 'job1', status: 'running', progress: 0.5 }
    vi.mocked(fetch).mockResolvedValueOnce(jobResponse(job))
    const result = await fetchJob('job1')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/jobs/job1')
    expect(result).toEqual(job)
  })
})

describe('pollJobToResult', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('resolves via fetchResult(result_slug) once the job succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jobResponse({ id: 'job1', status: 'queued' }))
      .mockResolvedValueOnce(jobResponse({ id: 'job1', status: 'running' }))
      .mockResolvedValueOnce(jobResponse({ id: 'job1', status: 'succeeded', result_slug: 'route-1' }))

    const fetchResult = vi.fn(async (slug: string) => `result:${slug}`)
    const promise = pollJobToResult('job1', fetchResult, { intervalMs: 1000, timeoutMs: 60000 })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(promise).resolves.toBe('result:route-1')
    expect(fetchResult).toHaveBeenCalledWith('route-1')
  })

  it('calls onStatus on each poll', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse({ id: 'job1', status: 'succeeded', result_slug: 'route-1' }),
    )
    const onStatus = vi.fn()
    const fetchResult = vi.fn(async () => 'ok')
    const promise = pollJobToResult('job1', fetchResult, { onStatus })

    await vi.advanceTimersByTimeAsync(0)
    await promise

    expect(onStatus).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded', result_slug: 'route-1' }),
    )
  })

  it('rejects when the job fails, including the error message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse({ id: 'job1', status: 'failed', error: 'boom' }),
    )
    const fetchResult = vi.fn(async () => 'ok')
    const promise = pollJobToResult('job1', fetchResult)
    const settled = expect(promise).rejects.toThrow(/boom/)

    await vi.advanceTimersByTimeAsync(0)

    await settled
    expect(fetchResult).not.toHaveBeenCalled()
  })

  it('rejects when succeeded but result_slug is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jobResponse({ id: 'job1', status: 'succeeded' }))
    const fetchResult = vi.fn(async () => 'ok')
    const promise = pollJobToResult('job1', fetchResult)
    const settled = expect(promise).rejects.toThrow(/no result_slug/)

    await vi.advanceTimersByTimeAsync(0)

    await settled
  })

  it('rejects when the timeout is exceeded', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', status: 'running' }))
    const fetchResult = vi.fn(async () => 'ok')
    const promise = pollJobToResult('job1', fetchResult, { intervalMs: 1000, timeoutMs: 3000 })
    // Attach a catch immediately so the eventual rejection is never unhandled.
    const settled = expect(promise).rejects.toThrow(/timed out/)

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)

    await settled
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchResult = vi.fn(async () => 'ok')
    await expect(
      pollJobToResult('job1', fetchResult, { signal: controller.signal }),
    ).rejects.toThrow(/aborted/)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('short-circuits the wait when aborted during polling', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', status: 'running' }))
    const controller = new AbortController()
    const fetchResult = vi.fn(async () => 'ok')
    const promise = pollJobToResult('job1', fetchResult, {
      intervalMs: 1000,
      signal: controller.signal,
    })
    const settled = expect(promise).rejects.toThrow(/aborted/)

    await vi.advanceTimersByTimeAsync(0)
    controller.abort()

    await settled
  })
})
