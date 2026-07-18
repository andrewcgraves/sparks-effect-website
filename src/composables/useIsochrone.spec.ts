import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsochrone } from './useIsochrone'
import { IsochroneApiError, type IsochroneRequest } from '../api/isochrone'
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
    scenario_slug: 'ca-hsr',
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
})
