// @vitest-environment node
// No DOM in this file. See the environment note in vite.config.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsochrone } from './useIsochrone'
import { IsochroneApiError, type IsochroneRequest } from '../api/isochrone'
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
    vi.mocked(fetchIsochrone).mockRejectedValueOnce(new IsochroneApiError(500))
    const { data, error, loading, generate } = useIsochrone()
    await generate(request)
    expect(error.value).toBe('Failed to generate isochrone. Please try again.')
    expect(data.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('logs the real error detail via console.error on failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const realError = new IsochroneApiError(500)
    vi.mocked(fetchIsochrone).mockRejectedValueOnce(realError)
    const { generate } = useIsochrone()
    await generate(request)
    expect(spy).toHaveBeenCalledWith(realError)
  })

  it('fires trackIsochroneError with the HTTP status on an API error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchIsochrone).mockRejectedValueOnce(new IsochroneApiError(503))
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
        new IsochroneApiError(422, {
          cause: new ApiError('too far', 422, 'origin_out_of_range', {
            nearest_station_slug: 'sf',
            nearest_station_km: 60.6,
            max_reach_km: 2.5,
          }),
        }),
      )
      const { error, generate } = useIsochrone()

      await generate(request)

      expect(error.value).toContain('61 km')
      expect(error.value).not.toContain('try again')
    })
  })

  // SPA-230: a routing job the API gave up on — the isochrone service being
  // down, chief among the reasons — carries its own reason, and that reason is
  // what the user should see, in the same place every other error shows.
  describe('a routing job the API failed', () => {
    it('shows the API error text rather than the generic fallback', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValueOnce(
        new JobFailedError(
          'rj1',
          "The isochrone service isn't responding right now. Please try again in a few minutes.",
        ),
      )
      const { error, generate } = useIsochrone()

      await generate(request)

      expect(error.value).toBe(
        "The isochrone service isn't responding right now. Please try again in a few minutes.",
      )
    })

    // The worker can fail a job with no message recorded (an unreadable queue
    // message names no job to blame, for one). An empty reason is not a
    // reason, so the generic fallback is what a user should see instead of a
    // blank error line.
    it('falls back to the generic message when the API gave no reason', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValueOnce(new JobFailedError('rj1', ''))
      const { error, generate } = useIsochrone()

      await generate(request)

      expect(error.value).toBe('Failed to generate isochrone. Please try again.')
    })
  })

  // SPA-219: the API caps in-flight routing work and refuses the enqueue with
  // 429 + `backlog_full` once it is full. The request was fine, so the reader
  // is told the service is busy rather than that their isochrone failed.
  describe('an enqueue the API refused as backlog-full', () => {
    it('says the service is busy rather than the generic failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValueOnce(
        new IsochroneApiError(429, {
          cause: new ApiError('busy', 429, 'backlog_full'),
        }),
      )
      const { error, generate } = useIsochrone()

      await generate(request)

      expect(error.value).toMatch(/busy/i)
      expect(error.value).not.toBe('Failed to generate isochrone. Please try again.')
    })
  })

  it('clears a prior error at the start of the next generate', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchIsochrone).mockRejectedValueOnce(new IsochroneApiError(500))
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

    // What is on screen now is an answer, so the last failure's message has
    // nothing left to describe.
    it("clears a failed generate's error", async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValueOnce(new IsochroneApiError(500))
      const { data, error, generate, show } = useIsochrone()
      await generate(request)
      expect(error.value).not.toBeNull()

      show(stubResponse)

      expect(error.value).toBeNull()
      expect(data.value).toEqual(stubResponse)
    })
  })
})
