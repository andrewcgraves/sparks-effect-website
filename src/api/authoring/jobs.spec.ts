import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchJob, pollJobToResult } from './jobs'
import type { Job, TransitGraph } from './types'

function jobResponse(job: Job): Response {
  return { ok: true, status: 200, json: async () => job } as Response
}

const stubGraph: TransitGraph = {
  services: [{ service_id: 'svc1', edges: [{ from_slug: 'a', to_slug: 'b', seconds: 60 }], wait_secs: 30 }],
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
    const job: Job = { id: 'job1', kind: 'compile_user_service', status: 'running' }
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

  it('resolves with the job once it succeeds, result included', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'queued' }))
      .mockResolvedValueOnce(jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'running' }))
      .mockResolvedValueOnce(
        jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'succeeded', result: stubGraph }),
      )

    const promise = pollJobToResult('job1', { intervalMs: 1000, timeoutMs: 60000 })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(promise).resolves.toEqual(
      expect.objectContaining({ status: 'succeeded', result: stubGraph }),
    )
  })

  it('calls onStatus on each poll', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'succeeded', result: stubGraph }),
    )
    const onStatus = vi.fn()
    const promise = pollJobToResult('job1', { onStatus })

    await vi.advanceTimersByTimeAsync(0)
    await promise

    expect(onStatus).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded', result: stubGraph }),
    )
  })

  it('rejects when the job fails, including the error message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'failed', error: 'boom' }),
    )
    const promise = pollJobToResult('job1')
    const settled = expect(promise).rejects.toThrow(/boom/)

    await vi.advanceTimersByTimeAsync(0)

    await settled
  })

  it('rejects when succeeded but result is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'succeeded' }),
    )
    const promise = pollJobToResult('job1')
    const settled = expect(promise).rejects.toThrow(/no result/)

    await vi.advanceTimersByTimeAsync(0)

    await settled
  })

  it('rejects when the timeout is exceeded', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'running' }))
    const promise = pollJobToResult('job1', { intervalMs: 1000, timeoutMs: 3000 })
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
    await expect(
      pollJobToResult('job1', { signal: controller.signal }),
    ).rejects.toThrow(/aborted/)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('short-circuits the wait when aborted during polling', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'running' }))
    const controller = new AbortController()
    const promise = pollJobToResult('job1', {
      intervalMs: 1000,
      signal: controller.signal,
    })
    const settled = expect(promise).rejects.toThrow(/aborted/)

    await vi.advanceTimersByTimeAsync(0)
    controller.abort()

    await settled
  })
})
