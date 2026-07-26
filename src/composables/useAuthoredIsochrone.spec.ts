import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../api/authoring/client'
import type { AuthoredIsochroneRequest, Job, TransitGraph } from '../api/authoring'
import type { ChainResponse } from '../fixtures/isochrone'
import { useAuthoredIsochrone } from './useAuthoredIsochrone'

const payload = { lat: 37.7, lng: -122.4, duration: 30, mode: 'walk' as const }
const chain = { features: [] } as unknown as ChainResponse

const graphWithMerge: TransitGraph = {
  services: [],
  merge: {
    clusters: [{ key: 'c1', names: ['Union', 'Union Sq'] }],
    near_misses: [{
      a: { name: 'Union', service_id: 'svc1' },
      b: { name: 'Midtown', service_id: 'svc2' },
      distance_m: 120.4,
    }],
  },
} as unknown as TransitGraph

const queuedJob = { id: 'job1', kind: 'compile_user_scenario', status: 'queued' } as Job

// The composable takes its two endpoints as arguments, so the tests inject bare
// spies rather than mocking an api module — which is also what lets one suite
// cover the behaviour both the scenario and service pages rely on.
let compile: Mock<(slug: string) => Promise<Job>>
let isochrone: Mock<(slug: string, request: AuthoredIsochroneRequest) => Promise<ChainResponse>>

function subject(getSlug: () => string | null = () => 'ca-hsr') {
  return useAuthoredIsochrone(getSlug, { compile, isochrone })
}

// useCompileJob polls the job endpoint through the jobs store; a succeeding
// job fetch is all this needs from the network.
function succeedingJobFetch(result: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'succeeded', result }),
  } as Response)
}

describe('useAuthoredIsochrone', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    compile = vi.fn()
    isochrone = vi.fn()
    vi.stubGlobal('fetch', succeedingJobFetch({ services: [] }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('plots against the current slug and stores the response', async () => {
    isochrone.mockResolvedValue(chain)
    const { handleIsochroneSubmit, isochroneData, origin } = subject()

    await handleIsochroneSubmit(payload)

    expect(isochrone).toHaveBeenCalledWith('ca-hsr', {
      lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk',
    })
    expect(isochroneData.value).toEqual(chain)
    expect(origin.value).toEqual({ lat: 37.7, lng: -122.4 })
  })

  it('plots against whichever endpoints it was handed', async () => {
    isochrone.mockResolvedValue(chain)
    const { handleIsochroneSubmit } = subject(() => 'northbound-express')

    await handleIsochroneSubmit(payload)

    expect(isochrone).toHaveBeenCalledWith('northbound-express', expect.anything())
  })

  it('does nothing without a slug', async () => {
    const { handleIsochroneSubmit } = subject(() => null)
    await handleIsochroneSubmit(payload)
    expect(isochrone).not.toHaveBeenCalled()
  })

  it('recompiles and retries transparently on a stale_graph 409', async () => {
    compile.mockResolvedValue(queuedJob)
    isochrone
      .mockRejectedValueOnce(new ApiError('stale', 409, 'stale_graph'))
      .mockResolvedValueOnce(chain)
    const { handleIsochroneSubmit, isochroneData, isochroneError } = subject()

    await handleIsochroneSubmit(payload)

    expect(compile).toHaveBeenCalledWith('ca-hsr')
    expect(isochroneData.value).toEqual(chain)
    expect(isochroneError.value).toBeNull()
  })

  it('gives up with an error once stale_graph retries are exhausted', async () => {
    compile.mockResolvedValue(queuedJob)
    isochrone.mockRejectedValue(new ApiError('stale', 409, 'stale_graph'))
    const { handleIsochroneSubmit, isochroneError, isochroneLoading } = subject()

    await handleIsochroneSubmit(payload)

    expect(isochroneError.value).toBe('Failed to generate isochrone. Please try again.')
    expect(isochroneLoading.value).toBe(false)
  })

  it('surfaces an error without recompiling on a non-stale failure', async () => {
    isochrone.mockRejectedValue(new ApiError('boom', 500))
    const { handleIsochroneSubmit, isochroneError } = subject()

    await handleIsochroneSubmit(payload)

    expect(compile).not.toHaveBeenCalled()
    expect(isochroneError.value).toBe('Failed to generate isochrone. Please try again.')
  })

  it('reports the form as loading while a compile is in flight', async () => {
    compile.mockResolvedValue(queuedJob)
    const { triggerCompile, isochroneFormLoading } = subject()

    const promise = triggerCompile('ca-hsr')
    expect(isochroneFormLoading.value).toBe(true)
    await promise
    expect(isochroneFormLoading.value).toBe(false)
  })

  it('reads near misses and clusters from a graph it was handed', () => {
    const { setGraph, nearMisses, realisedClusters } = subject()
    setGraph(graphWithMerge)
    expect(nearMisses.value).toHaveLength(1)
    expect(realisedClusters.value[0].names).toEqual(['Union', 'Union Sq'])
  })

  it('prefers a freshly compiled graph over the one it was handed', async () => {
    vi.stubGlobal('fetch', succeedingJobFetch({ services: [], merge: { clusters: [], near_misses: [] } }))
    compile.mockResolvedValue(queuedJob)
    const { setGraph, triggerCompile, nearMisses } = subject()
    setGraph(graphWithMerge)

    await triggerCompile('ca-hsr')

    expect(nearMisses.value).toHaveLength(0)
  })
})
