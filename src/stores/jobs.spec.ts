import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useJobsStore } from './jobs'
import type { Job, TransitGraph } from '../api/authoring'

function jobResponse(job: Job): Response {
  return { ok: true, status: 200, json: async () => job } as Response
}

const stubGraph: TransitGraph = {
  services: [{ service_id: 'svc1', edges: [{ from_slug: 'a', to_slug: 'b', seconds: 60 }], wait_secs: 30 }],
}

describe('useJobsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('has no tracked jobs to start with', () => {
    const jobs = useJobsStore()
    expect(jobs.anyPending).toBe(false)
    expect(jobs.jobById('job1')).toBeUndefined()
    expect(jobs.isPending('job1')).toBe(false)
  })

  it('records a job as pending while it polls, then stores its result', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'running' }))
      .mockResolvedValueOnce(
        jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'succeeded', result: stubGraph }),
      )

    const jobs = useJobsStore()
    const tracked = jobs.track('job1', { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(0)
    expect(jobs.isPending('job1')).toBe(true)
    expect(jobs.anyPending).toBe(true)
    expect(jobs.jobById('job1')?.status).toBe('running')

    await vi.advanceTimersByTimeAsync(1000)
    const resolved = await tracked
    expect(resolved.result).toEqual(stubGraph)

    expect(jobs.jobById('job1')?.status).toBe('succeeded')
    expect(jobs.jobById('job1')?.result).toEqual(stubGraph)
    expect(jobs.jobById('job1')?.error).toBeNull()
    expect(jobs.isPending('job1')).toBe(false)
    expect(jobs.anyPending).toBe(false)
  })

  it('records the failure message when a job fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'failed', error: 'solver exploded' }),
    )

    const jobs = useJobsStore()
    const tracked = jobs.track('job1')
    tracked.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    await expect(tracked).rejects.toThrow(/solver exploded/)

    expect(jobs.jobById('job1')?.status).toBe('failed')
    expect(jobs.jobById('job1')?.error).toMatch(/solver exploded/)
    expect(jobs.jobById('job1')?.result).toBeNull()
    expect(jobs.isPending('job1')).toBe(false)
  })

  it('tracks several jobs independently', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'succeeded', result: stubGraph }),
      )
      .mockResolvedValueOnce(jobResponse({ id: 'job2', kind: 'compile_user_service', status: 'running' }))

    const jobs = useJobsStore()
    const first = jobs.track('job1')
    jobs.track('job2').catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    await first

    expect(jobs.jobById('job1')?.status).toBe('succeeded')
    expect(jobs.jobById('job2')?.status).toBe('running')
    expect(jobs.anyPending).toBe(true)
  })

  it('cancel stops polling and marks the job cancelled', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'running' }))

    const jobs = useJobsStore()
    const tracked = jobs.track('job1', { intervalMs: 1000 })
    // Handle the rejection up front; the abort below settles it before the assertion runs.
    tracked.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    expect(jobs.isPending('job1')).toBe(true)

    jobs.cancel('job1')
    await vi.advanceTimersByTimeAsync(0)

    await expect(tracked).rejects.toThrow(/aborted/i)
    expect(jobs.jobById('job1')?.status).toBe('cancelled')
    expect(jobs.isPending('job1')).toBe(false)
  })

  it('cancel is a no-op for an unknown job', () => {
    const jobs = useJobsStore()
    expect(() => jobs.cancel('nope')).not.toThrow()
  })

  it('clear forgets a single job', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'succeeded', result: stubGraph }),
    )
    const jobs = useJobsStore()
    await vi.advanceTimersByTimeAsync(0)
    await jobs.track('job1')

    jobs.clear('job1')
    expect(jobs.jobById('job1')).toBeUndefined()
  })

  it('reset cancels everything in flight and empties the store', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'running' }))

    const jobs = useJobsStore()
    const tracked = jobs.track('job1', { intervalMs: 1000 })
    tracked.catch(() => {})
    await vi.advanceTimersByTimeAsync(0)

    jobs.reset()
    await vi.advanceTimersByTimeAsync(0)

    await expect(tracked).rejects.toThrow(/aborted/i)
    expect(jobs.jobById('job1')).toBeUndefined()
    expect(jobs.anyPending).toBe(false)
  })

  it('re-tracking a job id cancels the previous watch', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', kind: 'compile_user_service', status: 'running' }))

    const jobs = useJobsStore()
    const first = jobs.track('job1', { intervalMs: 1000 })
    first.catch(() => {})
    await vi.advanceTimersByTimeAsync(0)

    const second = jobs.track('job1', { intervalMs: 1000 })
    second.catch(() => {})
    await vi.advanceTimersByTimeAsync(0)

    await expect(first).rejects.toThrow(/aborted/i)
    // The replacement watch is still live.
    expect(jobs.isPending('job1')).toBe(true)
  })
})
