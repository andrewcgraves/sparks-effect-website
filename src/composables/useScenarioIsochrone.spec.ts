import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../api/authoring/client'
import type { TransitGraph } from '../api/authoring'
import type { ChainResponse } from '../fixtures/isochrone'

vi.mock('../api/authoring/scenarios', () => ({
  compileScenario: vi.fn(),
  fetchScenarioIsochrone: vi.fn(),
}))

import { useScenarioIsochrone } from './useScenarioIsochrone'
import { compileScenario, fetchScenarioIsochrone } from '../api/authoring/scenarios'

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

// useCompileJob polls the job endpoint through the jobs store; a succeeding
// job fetch is all this needs from the network.
function succeedingJobFetch(result: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'succeeded', result }),
  } as Response)
}

describe('useScenarioIsochrone', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(compileScenario).mockReset()
    vi.mocked(fetchScenarioIsochrone).mockReset()
    vi.stubGlobal('fetch', succeedingJobFetch({ services: [] }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('plots against the current slug and stores the response', async () => {
    vi.mocked(fetchScenarioIsochrone).mockResolvedValue(chain)
    const { handleIsochroneSubmit, isochroneData, origin } = useScenarioIsochrone(() => 'ca-hsr')

    await handleIsochroneSubmit(payload)

    expect(fetchScenarioIsochrone).toHaveBeenCalledWith('ca-hsr', {
      lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk',
    })
    expect(isochroneData.value).toEqual(chain)
    expect(origin.value).toEqual({ lat: 37.7, lng: -122.4 })
  })

  it('does nothing without a slug', async () => {
    const { handleIsochroneSubmit } = useScenarioIsochrone(() => null)
    await handleIsochroneSubmit(payload)
    expect(fetchScenarioIsochrone).not.toHaveBeenCalled()
  })

  it('recompiles and retries transparently on a stale_graph 409', async () => {
    vi.mocked(compileScenario).mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' })
    vi.mocked(fetchScenarioIsochrone)
      .mockRejectedValueOnce(new ApiError('stale', 409, 'stale_graph'))
      .mockResolvedValueOnce(chain)
    const { handleIsochroneSubmit, isochroneData, isochroneError } = useScenarioIsochrone(() => 'ca-hsr')

    await handleIsochroneSubmit(payload)

    expect(compileScenario).toHaveBeenCalledWith('ca-hsr')
    expect(isochroneData.value).toEqual(chain)
    expect(isochroneError.value).toBeNull()
  })

  it('gives up with an error once stale_graph retries are exhausted', async () => {
    vi.mocked(compileScenario).mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' })
    vi.mocked(fetchScenarioIsochrone).mockRejectedValue(new ApiError('stale', 409, 'stale_graph'))
    const { handleIsochroneSubmit, isochroneError, isochroneLoading } = useScenarioIsochrone(() => 'ca-hsr')

    await handleIsochroneSubmit(payload)

    expect(isochroneError.value).toBe('Failed to generate isochrone. Please try again.')
    expect(isochroneLoading.value).toBe(false)
  })

  it('surfaces an error without recompiling on a non-stale failure', async () => {
    vi.mocked(fetchScenarioIsochrone).mockRejectedValue(new ApiError('boom', 500))
    const { handleIsochroneSubmit, isochroneError } = useScenarioIsochrone(() => 'ca-hsr')

    await handleIsochroneSubmit(payload)

    expect(compileScenario).not.toHaveBeenCalled()
    expect(isochroneError.value).toBe('Failed to generate isochrone. Please try again.')
  })

  it('reports the form as loading while a compile is in flight', async () => {
    vi.mocked(compileScenario).mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' })
    const { triggerCompile, isochroneFormLoading } = useScenarioIsochrone(() => 'ca-hsr')

    const promise = triggerCompile('ca-hsr')
    expect(isochroneFormLoading.value).toBe(true)
    await promise
    expect(isochroneFormLoading.value).toBe(false)
  })

  it('reads near misses and clusters from a graph it was handed', () => {
    const { setGraph, nearMisses, realisedClusters } = useScenarioIsochrone(() => 'ca-hsr')
    setGraph(graphWithMerge)
    expect(nearMisses.value).toHaveLength(1)
    expect(realisedClusters.value[0].names).toEqual(['Union', 'Union Sq'])
  })

  it('prefers a freshly compiled graph over the one it was handed', async () => {
    vi.stubGlobal('fetch', succeedingJobFetch({ services: [], merge: { clusters: [], near_misses: [] } }))
    vi.mocked(compileScenario).mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' })
    const { setGraph, triggerCompile, nearMisses } = useScenarioIsochrone(() => 'ca-hsr')
    setGraph(graphWithMerge)

    await triggerCompile('ca-hsr')

    expect(nearMisses.value).toHaveLength(0)
  })
})
