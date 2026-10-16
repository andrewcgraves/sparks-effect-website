// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isReactive, nextTick, ref } from 'vue'
import { useIsochrone } from './useIsochrone'
import { OFFLINE_REASON } from './useRoutingStatus'
import type { IsochroneRequest } from '../api/isochrone'
import { ApiError } from '../api/authoring/client'
import { JobFailedError } from '../api/polling'
import type { Station } from '../api/scenarios'
import type { ChainResponse } from '../fixtures/isochrone'

vi.mock('../api/isochrone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/isochrone')>()
  return {
    ...actual,
    fetchIsochrone: vi.fn(),
  }
})

vi.mock('../analytics/index', () => ({
  trackIsochroneRequest: vi.fn(),
  trackIsochroneError: vi.fn(),
}))

import { fetchIsochrone } from '../api/isochrone'
import { trackIsochroneRequest, trackIsochroneError } from '../analytics/index'
import { useToastHost } from './useToast'

const request: IsochroneRequest = {
  lat: 37.3382,
  lng: -121.8863,
  budget_mins: 30,
  mode: 'walk',
  scenario_slug: 'ca-hsr',
}

const stubResponse: ChainResponse = {
  type: 'FeatureCollection',
  features: [],
  metadata: {
    reachable_stations: [],
    origin_budget_mins: 30,
    compile_job_id: 'compile-1',
    mode: 'walk',
    wait_model: 'half-headway',
    origin_iso_available: true,
  },
}

describe('useIsochrone', () => {
  beforeEach(() => {
    vi.mocked(fetchIsochrone).mockReset()
    vi.mocked(trackIsochroneRequest).mockClear()
    vi.mocked(trackIsochroneError).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with null data, no error, and not loading', () => {
    const { data, loading, error } = useIsochrone()
    expect(data.value).toBeNull()
    expect(error.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('sets data on a successful generate', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValueOnce(stubResponse)
    const { data, error, generate } = useIsochrone()
    await generate(request)
    expect(data.value).toEqual(stubResponse)
    expect(error.value).toBeNull()
  })

  it('does not make a generated plot deeply reactive', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValueOnce(stubResponse)
    const { data, generate } = useIsochrone()
    await generate(request)
    expect(isReactive(data.value)).toBe(false)
  })

  it('fires trackIsochroneRequest on attempt with mode and budget', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValueOnce(stubResponse)
    const { generate } = useIsochrone()
    await generate(request)
    expect(trackIsochroneRequest).toHaveBeenCalledWith('walk', 30)
  })

  it('toggles loading around a successful generate', async () => {
    let resolveFetch!: (v: ChainResponse) => void
    vi.mocked(fetchIsochrone).mockReturnValueOnce(
      new Promise<ChainResponse>((res) => { resolveFetch = res }),
    )
    const { loading, generate } = useIsochrone()
    const promise = generate(request)
    expect(loading.value).toBe(true)
    resolveFetch(stubResponse)
    await promise
    expect(loading.value).toBe(false)
  })

  it('sets a generic error message when the fetch throws', async () => {
    vi.mocked(fetchIsochrone).mockRejectedValueOnce(new ApiError('boom', 500))
    const { data, error, loading, generate } = useIsochrone()
    await generate(request)
    expect(error.value).toBe("Couldn't plot this splash zone. Please try again.")
    expect(data.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('logs the real error detail via console.error on failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const realError = new ApiError('boom', 500)
    vi.mocked(fetchIsochrone).mockRejectedValueOnce(realError)
    const { generate } = useIsochrone()
    await generate(request)
    expect(spy).toHaveBeenCalledWith(realError)
  })

  it('fires trackIsochroneError with the HTTP status on an API error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchIsochrone).mockRejectedValueOnce(new ApiError('boom', 503))
    const { generate } = useIsochrone()
    await generate(request)
    expect(trackIsochroneError).toHaveBeenCalledWith('walk', 30, 503)
  })

  it('fires trackIsochroneError with null status on a non-API (network) error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchIsochrone).mockRejectedValueOnce(new Error('network down'))
    const { generate } = useIsochrone()
    await generate(request)
    expect(trackIsochroneError).toHaveBeenCalledWith('walk', 30, null)
  })

  // SPA-200. The stations arrive as a getter, and with none of them the check
  // is skipped entirely — which is what every test above relies on.
  describe('the origin-range check', () => {
    const sanFrancisco: Station = {
      id: 'st1',
      scenario_id: 's1',
      slug: 'sf',
      name: 'San Francisco',
      location: { type: 'Point', coordinates: [-122.4, 37.7] },
      platform_height: '0',
    }
    // The request above is at San Jose, ~61 km from this station — far outside
    // the 2.5 km a 30-minute walk covers.
    const withStations = () => useIsochrone(() => [sanFrancisco])

    it('refuses an out-of-reach origin without asking the API', async () => {
      const { data, error, loading, generate } = withStations()

      await generate(request)

      expect(fetchIsochrone).not.toHaveBeenCalled()
      expect(error.value).toContain('nearest station')
      expect(data.value).toBeNull()
      expect(loading.value).toBe(false)
    })

    // A refusal is still an isochrone the user did not get, and it is counted
    // as one — with no status, since no request was made to have one.
    it('counts a refusal as an error, not as a request', async () => {
      const { generate } = withStations()

      await generate(request)

      expect(trackIsochroneRequest).not.toHaveBeenCalled()
      expect(trackIsochroneError).toHaveBeenCalledWith('walk', 30, null)
    })

    it('asks the API when a station is within reach', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValueOnce(stubResponse)
      const { error, generate } = withStations()

      await generate({ ...request, lat: 37.71, lng: -122.41 })

      expect(fetchIsochrone).toHaveBeenCalledOnce()
      expect(error.value).toBeNull()
    })

    // Transit covers more ground than a walk (40 km/h vs 5), so an origin that
    // a 30-minute walk cannot reach can still be a legitimate transit request.
    it('asks the API for a transit request that a walk of the same budget would refuse', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValueOnce(stubResponse)
      const { error, generate } = withStations()

      await generate({ ...request, mode: 'transit', budget_mins: 120 })

      expect(fetchIsochrone).toHaveBeenCalledOnce()
      expect(error.value).toBeNull()
    })

    // What the local check could not see: a station list that has gone stale,
    // or one that differs from the compiled graph the API measures against.
    it('reports the API refusal in its own terms', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValueOnce(
        new ApiError('too far', 422, 'origin_out_of_range', {
          nearest_station_slug: 'sf',
          nearest_station_km: 60.6,
          max_reach_km: 2.5,
        }),
      )
      const { error, generate } = useIsochrone()

      await generate(request)

      expect(error.value).toContain('61 km')
      expect(error.value).not.toContain('try again')
    })
  })

  // SPA-230: a routing job the API gave up on — the routing service being
  // down, chief among the reasons — carries its own reason. That reason is the
  // API's or the worker's text, so the page says it in product words, in the
  // same place every other error shows, and the reason goes to the console.
  describe('a routing job the API failed', () => {
    const ROUTING_FAILED =
      "Routing couldn't finish this splash zone. Please try again, or try a different starting point."

    it('says routing could not finish, without the API error text', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValueOnce(
        new JobFailedError('rj1', 'isochrone: routing unavailable'),
      )
      const { error, generate } = useIsochrone()

      await generate(request)

      expect(error.value).toBe(ROUTING_FAILED)
      expect(error.value).not.toContain('isochrone')
    })

    // The worker can fail a job with no message recorded (an unreadable queue
    // message names no job to blame, for one). The line is the same: what the
    // reader can do about it does not depend on a reason they never see.
    it('says the same when the API gave no reason', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValueOnce(new JobFailedError('rj1', ''))
      const { error, generate } = useIsochrone()

      await generate(request)

      expect(error.value).toBe(ROUTING_FAILED)
    })
  })

  // SPA-219: the API caps in-flight routing work and refuses the enqueue with
  // 429 + `backlog_full` once it is full. The request was fine, so the reader
  // is told the service is busy rather than that their isochrone failed.
  describe('an enqueue the API refused as backlog-full', () => {
    it('says the service is busy rather than the generic failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValueOnce(new ApiError('busy', 429, 'backlog_full'))
      const { error, generate } = useIsochrone()

      await generate(request)

      expect(error.value).toMatch(/busy/i)
      expect(error.value).not.toBe("Couldn't plot this splash zone. Please try again.")
    })
  })

  it('clears a prior error at the start of the next generate', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchIsochrone).mockRejectedValueOnce(new ApiError('boom', 500))
    const { error, generate } = useIsochrone()
    await generate(request)
    expect(error.value).not.toBeNull()

    vi.mocked(fetchIsochrone).mockResolvedValueOnce(stubResponse)
    await generate(request)
    expect(error.value).toBeNull()
  })

  // A pre-rendered isochrone is already plotted, so it reaches the map through
  // the same refs rather than round the side of them.
  describe('show', () => {
    it('draws a chain without asking the API', () => {
      const { data, loading, show } = useIsochrone()

      show(stubResponse)

      expect(data.value).toEqual(stubResponse)
      expect(loading.value).toBe(false)
      expect(fetchIsochrone).not.toHaveBeenCalled()
    })

    // A plot is replaced whole; proxying every coordinate in it only slows the
    // ridden-line maths that walks them (SPA-487).
    it('does not make the plot deeply reactive', () => {
      const { data, show } = useIsochrone()
      show(stubResponse)
      expect(isReactive(data.value)).toBe(false)
    })

    // What is on screen now is an answer, so the last failure's message has
    // nothing left to describe.
    it("clears a failed generate's error", async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValueOnce(new ApiError('boom', 500))
      const { data, error, generate, show } = useIsochrone()
      await generate(request)
      expect(error.value).not.toBeNull()

      show(stubResponse)

      expect(error.value).toBeNull()
      expect(data.value).toEqual(stubResponse)
    })
  })

  describe('overlapping requests', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      let reject!: (reason: unknown) => void
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
      return { promise, resolve, reject }
    }
    const older: ChainResponse = { ...stubResponse, metadata: { ...stubResponse.metadata, mode: 'walk' } }
    const newer: ChainResponse = { ...stubResponse, metadata: { ...stubResponse.metadata, mode: 'bike' } }

    it('keeps the newer answer when the older one lands last', async () => {
      const first = deferred<ChainResponse>()
      vi.mocked(fetchIsochrone).mockReturnValueOnce(first.promise).mockResolvedValueOnce(newer)
      const { data, loading, generate } = useIsochrone()
      const a = generate(request)
      await generate({ ...request, mode: 'bike' })
      first.resolve(older)
      await a
      expect(data.value).toEqual(newer)
      expect(loading.value).toBe(false)
    })

    it('keeps the newer answer when the older one fails last', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const first = deferred<ChainResponse>()
      vi.mocked(fetchIsochrone).mockReturnValueOnce(first.promise).mockResolvedValueOnce(newer)
      const { data, error, generate } = useIsochrone()
      const a = generate(request)
      await generate({ ...request, mode: 'bike' })
      first.reject(new Error('late'))
      await a
      expect(data.value).toEqual(newer)
      expect(error.value).toBeNull()
    })

    it('lets a shown answer stand over a request still in flight', async () => {
      const first = deferred<ChainResponse>()
      vi.mocked(fetchIsochrone).mockReturnValueOnce(first.promise)
      const { data, loading, generate, show } = useIsochrone()
      const a = generate(request)
      show(newer)
      first.resolve(older)
      await a
      expect(data.value).toEqual(newer)
      expect(loading.value).toBe(false)
    })
  })

  // SPA-503: a worker gone quiet will never answer, so the page stops waiting
  // out the job deadline the moment the status says so.
  describe('when live routing goes offline', () => {
    it('stops a plot in flight with the offline message and ignores its late answer', async () => {
      let resolveFetch!: (value: ChainResponse) => void
      vi.mocked(fetchIsochrone).mockReturnValueOnce(
        new Promise<ChainResponse>((res) => { resolveFetch = res }),
      )
      const offline = ref(false)
      const { data, loading, error, progress, generate } = useIsochrone(() => [], { offline: () => offline.value })

      const plot = generate(request)
      expect(loading.value).toBe(true)

      offline.value = true
      await nextTick()

      expect(loading.value).toBe(false)
      expect(progress.value).toBeNull()
      expect(error.value).toBe(OFFLINE_REASON)

      resolveFetch(stubResponse)
      await plot
      expect(data.value).toBeNull()
      expect(error.value).toBe(OFFLINE_REASON)
    })

    it('changes nothing when no plot is in flight', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValueOnce(stubResponse)
      const offline = ref(false)
      const { data, loading, error, generate } = useIsochrone(() => [], { offline: () => offline.value })
      await generate(request)

      offline.value = true
      await nextTick()

      expect(data.value).toEqual(stubResponse)
      expect(error.value).toBeNull()
      expect(loading.value).toBe(false)
    })
  })

  // SPA-467: the overlay tells the visitor where they are in the queue, so the
  // latest poll has to reach the page — and only the current plot's polls.
  describe('progress', () => {
    function pending() {
      return new Promise<ChainResponse>(() => {})
    }

    it('starts at null, meaning no poll has answered yet', () => {
      expect(useIsochrone().progress.value).toBeNull()
    })

    it('holds the latest poll of the plot in flight', () => {
      vi.mocked(fetchIsochrone).mockImplementationOnce((_request, onProgress) => {
        onProgress?.({ status: 'queued', queue_position: 2 })
        onProgress?.({ status: 'queued', queue_position: 1 })
        return pending()
      })
      const { progress, generate } = useIsochrone()
      void generate(request)
      expect(progress.value).toEqual({ status: 'queued', queue_position: 1 })
    })

    it('starts the next plot from null rather than where the last plot stood', () => {
      let report: ((p: { status: 'queued'; queue_position: number }) => void) | undefined
      vi.mocked(fetchIsochrone)
        .mockImplementationOnce((_request, onProgress) => {
          onProgress?.({ status: 'running' })
          return pending()
        })
        .mockImplementationOnce((_request, onProgress) => {
          report = onProgress
          return pending()
        })
      const { progress, generate } = useIsochrone()
      void generate(request)
      void generate({ ...request, mode: 'bike' })
      expect(progress.value).toBeNull()
      report?.({ status: 'queued', queue_position: 3 })
      expect(progress.value).toEqual({ status: 'queued', queue_position: 3 })
    })

    // The last poll of a finished plot says succeeded; left standing, it would
    // word the next wait before that wait has said anything.
    it('clears once the plot it describes has ended', async () => {
      vi.mocked(fetchIsochrone).mockImplementationOnce(async (_request, onProgress) => {
        onProgress?.({ status: 'succeeded' })
        return stubResponse
      })
      const { progress, generate } = useIsochrone()
      await generate(request)
      expect(progress.value).toBeNull()
    })

    it('ignores polls from a plot already superseded', () => {
      let reportOlder: ((p: { status: 'running' }) => void) | undefined
      vi.mocked(fetchIsochrone)
        .mockImplementationOnce((_request, onProgress) => {
          reportOlder = onProgress
          return pending()
        })
        .mockImplementationOnce(() => pending())
      const { progress, generate } = useIsochrone()
      void generate(request)
      void generate({ ...request, mode: 'bike' })
      reportOlder?.({ status: 'running' })
      expect(progress.value).toBeNull()
    })
  })

  describe('announcing to a screen reader', () => {
    const announced = () => useToastHost().announcement.value?.message
    const reachingTwo: ChainResponse = {
      ...stubResponse,
      metadata: {
        ...stubResponse.metadata,
        reachable_stations: [
          { station_slug: 'a', access_mins: 5, access_secs: 300, remaining_mins: 25, remaining_secs: 1500 },
          { station_slug: 'b', access_mins: 9, access_secs: 540, remaining_mins: 21, remaining_secs: 1260 },
        ],
      },
    } as ChainResponse
    afterEach(() => useToastHost().clear())

    it('says the splash zone is being plotted, then how many stations it reaches', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValue(reachingTwo)
      const { generate } = useIsochrone()

      const promise = generate(request)
      expect(announced()).toBe('Plotting splash zone…')
      await promise
      expect(announced()).toBe('Splash zone ready: 2 stations reached')
    })

    it('says so when a ready-made splash zone is shown', () => {
      const { show } = useIsochrone()
      show(reachingTwo)
      expect(announced()).toBe('Splash zone ready: 2 stations reached')
    })

    it('leaves a failure to the alert that shows it', async () => {
      vi.mocked(fetchIsochrone).mockRejectedValue(new Error('boom'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { generate } = useIsochrone()
      await generate(request)
      expect(announced()).toBe('Plotting splash zone…')
    })
  })
})
