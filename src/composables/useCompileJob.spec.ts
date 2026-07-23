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

    expect(compile).toHaveBeenCalledWith('ca-hsr')
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

  it('transparently recompiles on a stale_graph 409 and succeeds without surfacing an error', async () => {
    vi.stubGlobal('fetch', succeedingJobFetch({ services: [] }))
    const compile = vi.fn()
      .mockRejectedValueOnce(new ApiError('stale', 409, 'stale_graph'))
      .mockResolvedValueOnce({ id: 'job2', kind: 'compile_user_scenario', status: 'queued' } as Job)
    const { compileError, trigger } = useCompileJob(compile)

    await trigger('ca-hsr')

    expect(compile).toHaveBeenCalledTimes(2)
    expect(compileError.value).toBe('')
  })

  it('gives up after the retry bound and surfaces the last error', async () => {
    const compile = vi.fn().mockRejectedValue(new ApiError('still stale', 409, 'stale_graph'))
    const { compileError, trigger } = useCompileJob(compile)

    await trigger('ca-hsr')

    expect(compile).toHaveBeenCalledTimes(3)
    expect(compileError.value).toContain('still stale')
  })

  it('surfaces a non-stale error immediately, without retrying', async () => {
    const compile = vi.fn().mockRejectedValue(new Error('compile blew up'))
    const { compileError, trigger } = useCompileJob(compile)

    await trigger('ca-hsr')

    expect(compile).toHaveBeenCalledTimes(1)
    expect(compileError.value).toBe('compile blew up')
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
})
