import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listScenarios,
  fetchMyScenarios,
  fetchScenario,
  createScenario,
  updateScenario,
  deleteScenario,
  compileScenario,
  fetchScenarioIsochrone,
  fetchScenarioGraph,
} from './scenarios'
import { ApiError } from './client'
import type { Job, Scenario, ScenarioInput } from './types'
import type { ChainResponse } from '../../fixtures/isochrone'

const stubInput: ScenarioInput = {
  name: 'CA HSR',
  description: 'California High-Speed Rail',
  service_ids: ['svc1', 'svc2'],
}

const stubScenario: Scenario = {
  id: 's1',
  slug: 'ca-hsr',
  ...stubInput,
}

const stubChain = { type: 'FeatureCollection', features: [], metadata: {} } as unknown as ChainResponse

// The endpoint answers 202 with a routing job now (SPA-182), so a result takes
// two responses: the enqueue, then a poll. Succeeding on the first poll keeps
// these timer-free — the cadence and deadline are routingJobs.spec's subject.
function enqueueThenSucceed(): void {
  vi.mocked(fetch)
    .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ id: 'rj1' }) } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'rj1', status: 'succeeded', result: stubChain }),
    } as Response)
}

describe('scenarios CRUD', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('listScenarios GETs /api/user-scenarios', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => [stubScenario] } as Response)
    const result = await listScenarios()
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/user-scenarios')
    expect(result).toEqual([stubScenario])
  })

  it('fetchMyScenarios GETs /api/user-scenarios, same as listScenarios', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => [stubScenario] } as Response)
    const result = await fetchMyScenarios()
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/user-scenarios')
    expect(result).toEqual([stubScenario])
  })

  it('fetchScenario GETs /api/user-scenarios/{slug}', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubScenario } as Response)
    await fetchScenario('ca-hsr')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/user-scenarios/ca-hsr')
  })

  it('createScenario POSTs a body containing service_ids', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubScenario } as Response)
    await createScenario(stubInput)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/user-scenarios')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.service_ids).toEqual(['svc1', 'svc2'])
  })

  it('updateScenario PUTs a body containing service_ids', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubScenario } as Response)
    await updateScenario('ca-hsr', stubInput)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/user-scenarios/ca-hsr')
    expect((init as RequestInit).method).toBe('PUT')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.service_ids).toEqual(['svc1', 'svc2'])
  })

  it('deleteScenario DELETEs and resolves void', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    const result = await deleteScenario('ca-hsr')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/user-scenarios/ca-hsr')
    expect((init as RequestInit).method).toBe('DELETE')
    expect(result).toBeUndefined()
  })

  it('throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    await expect(listScenarios()).rejects.toThrow()
  })

  it('compileScenario POSTs to /api/user-scenarios/{slug}/compile', async () => {
    const job: Job = { id: 'job1', kind: 'compile_user_scenario', status: 'queued' }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 202, json: async () => job } as Response)
    const result = await compileScenario('ca-hsr')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/user-scenarios/ca-hsr/compile')
    expect((init as RequestInit).method).toBe('POST')
    expect(result).toEqual(job)
  })

  it('forwards a caller-supplied X-Trace-Id on the compile POST', async () => {
    const job: Job = { id: 'job1', kind: 'compile_user_scenario', status: 'queued' }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 202, json: async () => job } as Response)
    await compileScenario('ca-hsr', { headers: { 'X-Trace-Id': 'compile-trace' } })
    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers)
    expect(headers.get('X-Trace-Id')).toBe('compile-trace')
  })

  it('fetchScenarioGraph GETs /api/user-scenarios/{slug}/graph', async () => {
    const graph = { services: [] }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => graph } as Response)
    const result = await fetchScenarioGraph('ca-hsr')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/user-scenarios/ca-hsr/graph')
    expect(result).toEqual(graph)
  })

  it('fetchScenarioGraph surfaces a 404 as an ApiError when nothing is compiled yet', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'no compiled graph for this scenario yet' }),
    } as Response)
    await expect(fetchScenarioGraph('ca-hsr')).rejects.toBeInstanceOf(ApiError)
  })

  it('fetchScenarioIsochrone POSTs to /api/user-scenarios/{slug}/isochrone with the request body', async () => {
    enqueueThenSucceed()
    const result = await fetchScenarioIsochrone('ca-hsr', { lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/user-scenarios/ca-hsr/isochrone')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({ lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk' })
    expect(result).toEqual(stubChain)
  })

  // The endpoint answers 202 with a routing job now (SPA-182), so the result
  // arrives from the poll rather than from the POST.
  it('fetchScenarioIsochrone polls the routing job the enqueue answered with', async () => {
    enqueueThenSucceed()
    await fetchScenarioIsochrone('ca-hsr', { lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk' })
    const [url] = vi.mocked(fetch).mock.calls[1]
    expect(url).toContain('/api/routing-jobs/rj1')
  })

  // The stale-graph check runs before anything is enqueued, so this is still
  // answered by the POST itself — which is what keeps useAuthoredGraph's
  // recompile-and-retry recovery working untouched.
  it('fetchScenarioIsochrone surfaces a stale_graph ApiError code on 409', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'compiled graph is stale', code: 'stale_graph' }),
    } as Response)
    await expect(
      fetchScenarioIsochrone('ca-hsr', { lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk' }),
    ).rejects.toMatchObject({ code: 'stale_graph' } satisfies Partial<ApiError>)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })
})
