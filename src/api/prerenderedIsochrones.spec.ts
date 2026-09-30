// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setAuthTokenProvider } from './authoring/client'
import {
  fetchPrerenderedIsochrone,
  listPrerenderedIsochrones,
  type PrerenderedIsochrone,
  type PrerenderedIsochroneSummary,
} from './prerenderedIsochrones'
import type { ChainResponse } from '../fixtures/isochrone'

const stubSummary: PrerenderedIsochroneSummary = {
  id: 'pre-1',
  label: 'Downtown SF, 30 min walk',
  lat: 37.7749,
  lng: -122.4194,
  budget_mins: 30,
  mode: 'walk',
  outdated: false,
  created_at: '2026-08-01T12:00:00Z',
}

const stubChain: ChainResponse = {
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

const stubDetail: PrerenderedIsochrone = { ...stubSummary, result: stubChain }

describe('listPrerenderedIsochrones', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    setAuthTokenProvider(null)
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('fetches from the scenario-scoped endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [stubSummary] } as Response)
    await listPrerenderedIsochrones('ca-hsr')
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/scenarios/ca-hsr/prerendered-isochrones')
  })

  it('uses VITE_API_BASE_URL when set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://custom-api:9000')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    await listPrerenderedIsochrones('ca-hsr')
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('http://custom-api:9000')
  })

  it('returns the parsed metadata list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [stubSummary] } as Response)
    expect(await listPrerenderedIsochrones('ca-hsr')).toEqual([stubSummary])
  })

  // A scenario shipping none of these is ordinary, not a failure.
  it('returns an empty list for a scenario with none', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    expect(await listPrerenderedIsochrones('ca-hsr')).toEqual([])
  })

  // SPA-290: a plain Error is what every fault-narrowing function in the app
  // rejects on its first line, so these endpoints could not reach any of them.
  // An ApiError carries the status and the API's own words instead. This route
  // fails code-lessly — a bare `internal error` is all it says — so there is
  // no code here to read, and none is invented.
  it('throws an ApiError carrying the status and message of a failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal error' }),
    } as Response)

    const err = await listPrerenderedIsochrones('ca-hsr').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(500)
    expect((err as ApiError).message).toContain('internal error')
    expect((err as ApiError).code).toBeUndefined()
    expect((err as ApiError).detail).toBeUndefined()
  })

  // These reads are public, but they are on the shared client now, so a
  // signed-in reader's session token rides along as it does everywhere else.
  // The API ignores it on this route; pinned so a change either way is a
  // decision rather than a surprise.
  it('sends the ambient session token', async () => {
    setAuthTokenProvider(() => 'tok-1')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    await listPrerenderedIsochrones('ca-hsr')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-1')
  })

  it('sends a X-Trace-Id header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    await listPrerenderedIsochrones('ca-hsr')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('X-Trace-Id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('fetchPrerenderedIsochrone', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  // By id, not by scenario: the id is what the list hands over, and the chain
  // is the same one whichever scenario page asked for it.
  it('fetches one isochrone by id, off the scenario path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubDetail } as Response)
    await fetchPrerenderedIsochrone('pre-1')
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/prerendered-isochrones/pre-1')
    expect(calledUrl).not.toContain('/api/scenarios')
  })

  it('returns the chain alongside the metadata', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubDetail } as Response)
    const result = await fetchPrerenderedIsochrone('pre-1')
    expect(result.result).toEqual(stubChain)
    expect(result.label).toBe('Downtown SF, 30 min walk')
  })

  it('throws an ApiError carrying the status when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'prerendered isochrone not found' }),
    } as Response)

    const err = await fetchPrerenderedIsochrone('pre-1').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
  })

  it('sends a X-Trace-Id header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubDetail } as Response)
    await fetchPrerenderedIsochrone('pre-1')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('X-Trace-Id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})
