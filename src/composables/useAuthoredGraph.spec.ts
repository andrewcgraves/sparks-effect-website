import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { ApiError } from '../api/authoring/client'
import type { AuthoredIsochroneRequest, Job, TransitGraph } from '../api/authoring'
import type { ChainResponse } from '../fixtures/isochrone'
import { useAuthoredGraph } from './useAuthoredGraph'

const payload = { lat: 37.7, lng: -122.4, duration: 30, mode: 'walk' as const }
const chain = { features: [] } as unknown as ChainResponse
const otherChain = { features: [{}] } as unknown as ChainResponse

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

const stale = () => new ApiError('stale', 409, 'stale_graph')

// The module takes its three endpoints as arguments, so the tests inject bare
// spies rather than mocking an api module — which is also what lets one suite
// cover the behaviour both the scenario and service pages rely on.
let compile: Mock<(slug: string) => Promise<Job>>
let fetchGraph: Mock<(slug: string) => Promise<TransitGraph>>
let isochrone: Mock<(slug: string, request: AuthoredIsochroneRequest) => Promise<ChainResponse>>

function subject(getSlug: () => string | null = () => 'ca-hsr') {
  return useAuthoredGraph(getSlug, { compile, fetchGraph, isochrone })
}

// Compiling polls the job endpoint through the jobs store; a succeeding job
// fetch is all this needs from the network.
function succeedingJobFetch(result: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'succeeded', result }),
  } as Response)
}

// A job that polls to 'failed': the compile call was accepted and the work blew
// up afterwards, which reaches the caller by a different path from a compile
// call that is refused outright.
function failingJobFetch(error: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'failed', error }),
  } as Response)
}

// Resolves only when the returned `release` is called, so a test can hold one
// attempt open while a second overtakes it.
function deferred<T>() {
  let release!: (value: T) => void
  const promise = new Promise<T>((resolve) => { release = resolve })
  return { promise, release }
}

describe('useAuthoredGraph', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    compile = vi.fn()
    fetchGraph = vi.fn()
    isochrone = vi.fn()
    vi.stubGlobal('fetch', succeedingJobFetch({ services: [] }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('loading the graph', () => {
    it('reads an already-compiled graph rather than recompiling', async () => {
      fetchGraph.mockResolvedValue(graphWithMerge)
      const { loadGraph, graph, graphFailed } = subject()

      await loadGraph('ca-hsr')

      expect(fetchGraph).toHaveBeenCalledWith('ca-hsr')
      expect(compile).not.toHaveBeenCalled()
      expect(graph.value).toEqual(graphWithMerge)
      expect(graphFailed.value).toBe(false)
    })

    // A 404 means this target has never compiled, which is a reason to compile,
    // not an error to show.
    it('compiles when there is no graph yet', async () => {
      fetchGraph.mockRejectedValue(new ApiError('no compiled graph', 404))
      compile.mockResolvedValue(queuedJob)
      const { loadGraph, graphFailed } = subject()

      await loadGraph('ca-hsr')

      expect(compile).toHaveBeenCalledWith('ca-hsr')
      expect(graphFailed.value).toBe(false)
    })

    it('reports a failure for anything other than a 404', async () => {
      fetchGraph.mockRejectedValue(new ApiError('boom', 500))
      const { loadGraph, graphFailed } = subject()

      await loadGraph('ca-hsr')

      expect(compile).not.toHaveBeenCalled()
      expect(graphFailed.value).toBe(true)
    })

    it('reads near misses and clusters off the graph it loaded', async () => {
      fetchGraph.mockResolvedValue(graphWithMerge)
      const { loadGraph, nearMisses, realisedClusters } = subject()

      await loadGraph('ca-hsr')

      expect(nearMisses.value).toHaveLength(1)
      expect(realisedClusters.value[0].names).toEqual(['Union', 'Union Sq'])
    })

    it('prefers a freshly compiled graph over the one it loaded', async () => {
      vi.stubGlobal('fetch', succeedingJobFetch({ services: [], merge: { clusters: [], near_misses: [] } }))
      fetchGraph.mockResolvedValue(graphWithMerge)
      compile.mockResolvedValue(queuedJob)
      const { loadGraph, triggerCompile, nearMisses } = subject()
      await loadGraph('ca-hsr')

      await triggerCompile('ca-hsr')

      expect(nearMisses.value).toHaveLength(0)
    })
  })

  describe('compiling', () => {
    it('captures the compiled graph once the job succeeds', async () => {
      vi.stubGlobal('fetch', succeedingJobFetch({ services: [{ service_id: 's1', edges: [], wait_secs: 0 }] }))
      compile.mockResolvedValue(queuedJob)
      const { triggerCompile, graph, compileError, compiling } = subject()

      await triggerCompile('ca-hsr')

      expect(compile).toHaveBeenCalledWith('ca-hsr')
      expect(graph.value).toEqual({ services: [{ service_id: 's1', edges: [], wait_secs: 0 }] })
      expect(compileError.value).toBe('')
      expect(compiling.value).toBe(false)
    })

    it('surfaces a compile call that is refused outright', async () => {
      compile.mockRejectedValue(new ApiError('compile blew up', 500))
      const { triggerCompile, compileError, compiling } = subject()

      await triggerCompile('ca-hsr')

      expect(compileError.value).toContain('compile blew up')
      expect(compiling.value).toBe(false)
    })

    it('surfaces a job that polls to failed', async () => {
      vi.stubGlobal('fetch', failingJobFetch('graph has a disconnected stop'))
      compile.mockResolvedValue(queuedJob)
      const { triggerCompile, compileError, graph } = subject()

      await triggerCompile('ca-hsr')

      expect(compileError.value).toContain('disconnected stop')
      expect(graph.value).toBeNull()
    })

    // Only the isochrone endpoint answers 409 stale_graph; compile never has.
    // This retried it anyway, on a branch nothing could reach.
    it('does not retry a compile that is refused as stale', async () => {
      compile.mockRejectedValue(stale())
      const { triggerCompile, compileError } = subject()

      await triggerCompile('ca-hsr')

      expect(compile).toHaveBeenCalledTimes(1)
      expect(compileError.value).toContain('stale')
    })

    it('reports the form as loading while a compile is in flight', async () => {
      compile.mockResolvedValue(queuedJob)
      const { triggerCompile, isochroneFormLoading } = subject()

      const promise = triggerCompile('ca-hsr')
      expect(isochroneFormLoading.value).toBe(true)
      await promise
      expect(isochroneFormLoading.value).toBe(false)
    })
  })

  describe('plotting an isochrone', () => {
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

    it('forwards transit mode on the isochrone request', async () => {
      isochrone.mockResolvedValue(chain)
      const { handleIsochroneSubmit } = subject()

      await handleIsochroneSubmit({ ...payload, mode: 'transit' })

      expect(isochrone).toHaveBeenCalledWith('ca-hsr', expect.objectContaining({ mode: 'transit' }))
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
      isochrone.mockRejectedValueOnce(stale()).mockResolvedValueOnce(chain)
      const { handleIsochroneSubmit, isochroneData, isochroneError } = subject()

      await handleIsochroneSubmit(payload)

      expect(compile).toHaveBeenCalledWith('ca-hsr')
      expect(compile).toHaveBeenCalledTimes(1)
      expect(isochroneData.value).toEqual(chain)
      expect(isochroneError.value).toBeNull()
    })

    it('gives up with an error once stale_graph retries are exhausted', async () => {
      compile.mockResolvedValue(queuedJob)
      isochrone.mockRejectedValue(stale())
      const { handleIsochroneSubmit, isochroneError, isochroneLoading } = subject()

      await handleIsochroneSubmit(payload)

      expect(isochrone).toHaveBeenCalledTimes(3)
      expect(isochroneError.value).toBe('Failed to generate isochrone. Please try again.')
      expect(isochroneLoading.value).toBe(false)
    })

    it('stops retrying when the recompile it needs fails', async () => {
      compile.mockRejectedValue(new ApiError('compile blew up', 500))
      isochrone.mockRejectedValue(stale())
      const { handleIsochroneSubmit, isochroneError } = subject()

      await handleIsochroneSubmit(payload)

      expect(isochrone).toHaveBeenCalledTimes(1)
      expect(isochroneError.value).toBe('Failed to generate isochrone. Please try again.')
    })

    it('surfaces an error without recompiling on a non-stale failure', async () => {
      isochrone.mockRejectedValue(new ApiError('boom', 500))
      const { handleIsochroneSubmit, isochroneError } = subject()

      await handleIsochroneSubmit(payload)

      expect(compile).not.toHaveBeenCalled()
      expect(isochroneError.value).toBe('Failed to generate isochrone. Please try again.')
    })
  })

  // SPA-200. Unlike the seeded page, this measures against the compiled graph's
  // own nodes — the very set the API measures against — so the two agree
  // exactly and a local refusal is one the API would have made too.
  describe('an origin out of range of every station', () => {
    // The graph the page has loaded, with one station kmNorth kilometres north
    // of the payload's origin. A degree of latitude is ~111.19 km.
    function graphWithStationAt(kmNorth: number): TransitGraph {
      return {
        services: [],
        nodes: [{ slug: 'sf', names: ['San Francisco'], lat: 37.7 + kmNorth / 111.19, lng: -122.4 }],
      } as unknown as TransitGraph
    }

    async function loadedOver(graph: TransitGraph) {
      fetchGraph.mockResolvedValue(graph)
      const s = subject()
      await s.loadGraph('ca-hsr')
      return s
    }

    it('is refused without asking the API', async () => {
      const { handleIsochroneSubmit, isochroneError } = await loadedOver(graphWithStationAt(100))

      await handleIsochroneSubmit(payload)

      expect(isochrone).not.toHaveBeenCalled()
      expect(isochroneError.value).toContain('nearest station')
    })

    it('leaves nothing spinning and no stale plot behind', async () => {
      const s = await loadedOver(graphWithStationAt(100))
      s.isochroneData.value = chain

      await s.handleIsochroneSubmit(payload)

      expect(s.isochroneLoading.value).toBe(false)
      expect(s.isochroneData.value).toBeNull()
    })

    // The counterpart, so a check that refused everything would not pass.
    it('plots normally when a station is within reach', async () => {
      isochrone.mockResolvedValue(chain)
      const { handleIsochroneSubmit, isochroneError } = await loadedOver(graphWithStationAt(1))

      await handleIsochroneSubmit(payload)

      expect(isochrone).toHaveBeenCalledOnce()
      expect(isochroneError.value).toBeNull()
    })

    // A graph with no nodes says nothing about how far away the origin is, so
    // the request goes out and the API decides with the real graph in hand.
    it('does not refuse against a graph it cannot see any stations in', async () => {
      isochrone.mockResolvedValue(chain)
      const { handleIsochroneSubmit } = subject()

      await handleIsochroneSubmit(payload)

      expect(isochrone).toHaveBeenCalledOnce()
    })

    // The arm for what the local check could not see — most plausibly a
    // recompile that has just moved or dropped the station it measured against.
    it('reports the API refusal in its own terms', async () => {
      isochrone.mockRejectedValue(
        new ApiError('too far', 422, 'origin_out_of_range', {
          nearest_station_slug: 'sf',
          nearest_station_km: 111.2,
          max_reach_km: 2.5,
        }),
      )
      const { handleIsochroneSubmit, isochroneError } = subject()

      await handleIsochroneSubmit(payload)

      expect(compile).not.toHaveBeenCalled()
      expect(isochroneError.value).toContain('111 km')
      expect(isochroneError.value).not.toContain('try again')
    })
  })

  // SPA-219: the API caps in-flight routing work across all three isochrone
  // endpoints, this one included, and refuses the enqueue with 429 +
  // `backlog_full` once it is full. The authored target is fine and so is the
  // request, so neither a recompile nor the generic failure is the answer.
  describe('an enqueue the API refused as backlog-full', () => {
    it('says the service is busy, and does not recompile', async () => {
      isochrone.mockRejectedValue(new ApiError('busy', 429, 'backlog_full'))
      const { handleIsochroneSubmit, isochroneError } = subject()

      await handleIsochroneSubmit(payload)

      expect(compile).not.toHaveBeenCalled()
      expect(isochroneError.value).toMatch(/busy/i)
      expect(isochroneError.value).not.toBe('Failed to generate isochrone. Please try again.')
    })
  })

  // A detail page is a form the user can resubmit before the last answer lands.
  // Whichever attempt they started last is the one they are waiting on, so an
  // earlier one returning late must not write anything.
  describe('superseded attempts', () => {
    it('ignores the result of an isochrone the user has already resubmitted', async () => {
      const first = deferred<ChainResponse>()
      isochrone.mockReturnValueOnce(first.promise).mockResolvedValueOnce(otherChain)
      const { handleIsochroneSubmit, isochroneData } = subject()

      const stalePlot = handleIsochroneSubmit(payload)
      await handleIsochroneSubmit({ ...payload, duration: 45 })
      first.release(chain)
      await stalePlot

      expect(isochroneData.value).toEqual(otherChain)
    })

    it('ignores the failure of an isochrone the user has already resubmitted', async () => {
      const first = deferred<ChainResponse>()
      isochrone.mockReturnValueOnce(first.promise.then(() => { throw new ApiError('boom', 500) }))
      isochrone.mockResolvedValueOnce(chain)
      const { handleIsochroneSubmit, isochroneData, isochroneError, isochroneLoading } = subject()

      const stalePlot = handleIsochroneSubmit(payload)
      await handleIsochroneSubmit({ ...payload, duration: 45 })
      first.release(chain)
      await stalePlot

      expect(isochroneError.value).toBeNull()
      expect(isochroneData.value).toEqual(chain)
      expect(isochroneLoading.value).toBe(false)
    })

    it('ignores the result of a compile that has been superseded', async () => {
      const first = deferred<Job>()
      compile.mockReturnValueOnce(first.promise).mockResolvedValueOnce(queuedJob)
      const { triggerCompile, compileError } = subject()

      const staleCompile = triggerCompile('ca-hsr')
      await triggerCompile('ca-hsr')
      first.release({ ...queuedJob, id: 'job-old' })
      await staleCompile

      expect(compileError.value).toBe('')
    })

    // A load that 404s ends in a compile, so abandoning the load has to abandon
    // that compile too — `graph` prefers a compiled graph over a loaded one, so
    // an older load's compile landing late would win over the newer load.
    it('ignores the compile an abandoned graph load started', async () => {
      vi.stubGlobal('fetch', succeedingJobFetch(graphWithMerge))
      const firstCompile = deferred<Job>()
      fetchGraph
        .mockRejectedValueOnce(new ApiError('no compiled graph', 404))
        .mockResolvedValueOnce({ services: [] } as TransitGraph)
      compile.mockReturnValueOnce(firstCompile.promise)

      const { loadGraph, graph } = subject()
      const staleLoad = loadGraph('ca-hsr')
      await loadGraph('other')
      firstCompile.release(queuedJob)
      await staleLoad
      await flushPromises()

      expect(graph.value).toEqual({ services: [] })
    })

    it('ignores a graph load the caller has moved on from', async () => {
      const first = deferred<TransitGraph>()
      fetchGraph.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ services: [] } as TransitGraph)
      const { loadGraph, graph } = subject()

      const staleLoad = loadGraph('ca-hsr')
      await loadGraph('other')
      first.release(graphWithMerge)
      await staleLoad

      expect(graph.value).toEqual({ services: [] })
    })
  })

  describe('reset', () => {
    it('clears the graph, the plot, and every error', async () => {
      fetchGraph.mockResolvedValue(graphWithMerge)
      isochrone.mockResolvedValue(chain)
      const {
        loadGraph, handleIsochroneSubmit, reset,
        graph, graphFailed, isochroneData, origin, isochroneError, compileError,
      } = subject()
      await loadGraph('ca-hsr')
      await handleIsochroneSubmit(payload)

      reset()

      expect(graph.value).toBeNull()
      expect(graphFailed.value).toBe(false)
      expect(isochroneData.value).toBeNull()
      expect(origin.value).toBeNull()
      expect(isochroneError.value).toBeNull()
      expect(compileError.value).toBe('')
    })

    // Reset is how a caller abandons what is in flight, so an attempt that was
    // already running must not write its answer in afterwards.
    it('discards an isochrone that was in flight when it was called', async () => {
      const first = deferred<ChainResponse>()
      isochrone.mockReturnValueOnce(first.promise)
      const { handleIsochroneSubmit, reset, isochroneData, isochroneLoading } = subject()

      const abandoned = handleIsochroneSubmit(payload)
      reset()
      first.release(chain)
      await abandoned

      expect(isochroneData.value).toBeNull()
      expect(isochroneLoading.value).toBe(false)
    })
  })
})
