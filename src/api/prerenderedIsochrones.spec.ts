import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    await expect(listPrerenderedIsochrones('ca-hsr')).rejects.toThrow()
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

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    await expect(fetchPrerenderedIsochrone('pre-1')).rejects.toThrow()
  })

  it('sends a X-Trace-Id header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => stubDetail } as Response)
    await fetchPrerenderedIsochrone('pre-1')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('X-Trace-Id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})
