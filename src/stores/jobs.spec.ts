import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useJobsStore } from './jobs'
import type { Job } from '../api/authoring'

function jobResponse(job: Job): Response {
  return { ok: true, status: 200, json: async () => job } as Response
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
    expect(jobs.get('job1')).toBeUndefined()
    expect(jobs.isPending('job1')).toBe(false)
  })

  it('records a job as pending while it polls, then stores its result', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jobResponse({ id: 'job1', status: 'running', progress: 0.5 }))
      .mockResolvedValueOnce(jobResponse({ id: 'job1', status: 'succeeded', result_slug: 'route-1' }))

    const jobs = useJobsStore()
    const tracked = jobs.track('job1', async (slug: string) => `result:${slug}`, {
      intervalMs: 1000,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(jobs.isPending('job1')).toBe(true)
    expect(jobs.anyPending).toBe(true)
    expect(jobs.get('job1')?.status).toBe('running')
    expect(jobs.get('job1')?.progress).toBe(0.5)

    await vi.advanceTimersByTimeAsync(1000)
    await expect(tracked).resolves.toBe('result:route-1')

    expect(jobs.get('job1')?.status).toBe('succeeded')
    expect(jobs.get('job1')?.result).toBe('result:route-1')
    expect(jobs.get('job1')?.error).toBeNull()
    expect(jobs.isPending('job1')).toBe(false)
    expect(jobs.anyPending).toBe(false)
  })

  it('records the failure message when a job fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse({ id: 'job1', status: 'failed', error: 'solver exploded' }),
    )

    const jobs = useJobsStore()
    const tracked = jobs.track('job1', async (slug: string) => slug)
    tracked.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    await expect(tracked).rejects.toThrow(/solver exploded/)

    expect(jobs.get('job1')?.status).toBe('failed')
    expect(jobs.get('job1')?.error).toMatch(/solver exploded/)
    expect(jobs.get('job1')?.result).toBeNull()
    expect(jobs.isPending('job1')).toBe(false)
  })

  it('tracks several jobs independently', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jobResponse({ id: 'job1', status: 'succeeded', result_slug: 'r1' }))
      .mockResolvedValueOnce(jobResponse({ id: 'job2', status: 'running' }))

    const jobs = useJobsStore()
    const first = jobs.track('job1', async (slug: string) => slug)
    jobs.track('job2', async (slug: string) => slug).catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    await expect(first).resolves.toBe('r1')

    expect(jobs.get('job1')?.status).toBe('succeeded')
    expect(jobs.get('job2')?.status).toBe('running')
    expect(jobs.anyPending).toBe(true)
  })

  it('cancel stops polling and marks the job cancelled', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', status: 'running' }))

    const jobs = useJobsStore()
    const tracked = jobs.track('job1', async (slug: string) => slug, { intervalMs: 1000 })
    // Handle the rejection up front; the abort below settles it before the assertion runs.
    tracked.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    expect(jobs.isPending('job1')).toBe(true)

    jobs.cancel('job1')
    await vi.advanceTimersByTimeAsync(0)

    await expect(tracked).rejects.toThrow(/aborted/i)
    expect(jobs.get('job1')?.status).toBe('cancelled')
    expect(jobs.isPending('job1')).toBe(false)
  })

  it('cancel is a no-op for an unknown job', () => {
    const jobs = useJobsStore()
    expect(() => jobs.cancel('nope')).not.toThrow()
  })

  it('clear forgets a single job', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jobResponse({ id: 'job1', status: 'succeeded', result_slug: 'r1' }),
    )
    const jobs = useJobsStore()
    await vi.advanceTimersByTimeAsync(0)
    await jobs.track('job1', async (slug: string) => slug)

    jobs.clear('job1')
    expect(jobs.get('job1')).toBeUndefined()
  })

  it('reset cancels everything in flight and empties the store', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', status: 'running' }))

    const jobs = useJobsStore()
    const tracked = jobs.track('job1', async (slug: string) => slug, { intervalMs: 1000 })
    tracked.catch(() => {})
    await vi.advanceTimersByTimeAsync(0)

    jobs.reset()
    await vi.advanceTimersByTimeAsync(0)

    await expect(tracked).rejects.toThrow(/aborted/i)
    expect(jobs.get('job1')).toBeUndefined()
    expect(jobs.anyPending).toBe(false)
  })

  it('re-tracking a job id cancels the previous watch', async () => {
    vi.mocked(fetch).mockResolvedValue(jobResponse({ id: 'job1', status: 'running' }))

    const jobs = useJobsStore()
    const first = jobs.track('job1', async (slug: string) => slug, { intervalMs: 1000 })
    first.catch(() => {})
    await vi.advanceTimersByTimeAsync(0)

    const second = jobs.track('job1', async (slug: string) => slug, { intervalMs: 1000 })
    second.catch(() => {})
    await vi.advanceTimersByTimeAsync(0)

    await expect(first).rejects.toThrow(/aborted/i)
    // The replacement watch is still live.
    expect(jobs.isPending('job1')).toBe(true)
  })
})
