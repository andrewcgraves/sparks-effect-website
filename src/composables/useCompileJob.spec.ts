// @vitest-environment node
// No DOM in this file. See the environment note in vite.config.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCompileJob } from './useCompileJob'
import { ApiError } from '../api/authoring/client'
import type { Job } from '../api/authoring'

describe('useCompileJob', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function succeedingJobFetch(result: unknown) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'succeeded', result }),
    } as Response)
  }

  it('starts idle', () => {
    const { compiling, compileError, result } = useCompileJob(vi.fn())
    expect(compiling.value).toBe(false)
    expect(compileError.value).toBe('')
    expect(result.value).toBeNull()
  })

  it('fires the compile function, polls the job, and captures its result', async () => {
    vi.stubGlobal('fetch', succeedingJobFetch({ services: [{ service_id: 's1', edges: [], wait_secs: 0 }] }))
    const compile = vi.fn().mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' } as Job)
    const { compiling, compileError, result, trigger } = useCompileJob(compile)

    await trigger('ca-hsr')

    expect(compile).toHaveBeenCalledWith('ca-hsr', expect.objectContaining({ headers: expect.any(Object) }))
    expect(compiling.value).toBe(false)
    expect(compileError.value).toBe('')
    expect(result.value).toEqual({ services: [{ service_id: 's1', edges: [], wait_secs: 0 }] })
  })

  it('is compiling for the duration of the call', async () => {
    vi.stubGlobal('fetch', succeedingJobFetch({ services: [] }))
    const compile = vi.fn().mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' } as Job)
    const { compiling, trigger } = useCompileJob(compile)

    const promise = trigger('ca-hsr')
    expect(compiling.value).toBe(true)
    await promise
    expect(compiling.value).toBe(false)
  })

  it('surfaces a failure without retrying', async () => {
    const compile = vi.fn().mockRejectedValue(new Error('compile blew up'))
    const { compileError, trigger } = useCompileJob(compile)

    await trigger('ca-hsr')

    expect(compile).toHaveBeenCalledTimes(1)
    expect(compileError.value).toBe('compile blew up')
  })

  // Compile has never answered 409 stale_graph — only the isochrone endpoint
  // does, and useAuthoredGraph is where that recovery lives. This retried it
  // anyway, on a branch nothing could reach.
  it('does not treat a stale_graph refusal as a reason to retry', async () => {
    const compile = vi.fn().mockRejectedValue(new ApiError('still stale', 409, 'stale_graph'))
    const { compileError, trigger } = useCompileJob(compile)

    await trigger('ca-hsr')

    expect(compile).toHaveBeenCalledTimes(1)
    expect(compileError.value).toContain('still stale')
  })

  it('ignores an attempt that a later trigger has superseded', async () => {
    vi.stubGlobal('fetch', succeedingJobFetch({ services: [] }))
    let releaseFirst!: () => void
    const compile = vi.fn()
      .mockReturnValueOnce(new Promise((_, reject) => { releaseFirst = () => reject(new Error('the old one')) }))
      .mockResolvedValueOnce({ id: 'job2', kind: 'compile_user_scenario', status: 'queued' } as Job)
    const { compileError, result, trigger } = useCompileJob(compile)

    const superseded = trigger('ca-hsr')
    await trigger('ca-hsr')
    releaseFirst()
    await superseded

    expect(compileError.value).toBe('')
    expect(result.value).toEqual({ services: [] })
  })

  it('reset clears compiling, error, and result', async () => {
    const compile = vi.fn().mockRejectedValue(new Error('boom'))
    const { compiling, compileError, result, trigger, reset } = useCompileJob(compile)

    await trigger('ca-hsr')
    expect(compileError.value).not.toBe('')

    reset()
    expect(compiling.value).toBe(false)
    expect(compileError.value).toBe('')
    expect(result.value).toBeNull()
  })

  // SPA-205: the compile POST and every poll GET share one X-Trace-Id.
  it('reuses one X-Trace-Id across the compile call and every poll', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'job1',
          kind: 'compile_user_scenario',
          status: 'succeeded',
          result: { services: [] },
        }),
      } as Response),
    )
    const compile = vi.fn().mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' } as Job)
    const { trigger } = useCompileJob(compile)

    await trigger('ca-hsr')

    const compileInit = compile.mock.calls[0][1] as RequestInit
    const compileTrace = new Headers(compileInit.headers).get('X-Trace-Id')
    const pollTrace = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('X-Trace-Id')
    expect(compileTrace).toMatch(/^[0-9a-f-]{36}$/)
    expect(pollTrace).toBe(compileTrace)
  })
})
