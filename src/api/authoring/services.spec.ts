import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listServices,
  fetchMyServices,
  fetchService,
  createService,
  updateService,
  deleteService,
  compileService,
  fetchServiceGraph,
  fetchServiceIsochrone,
} from './services'
import { ApiError } from './client'
import type { ChainResponse } from '../../fixtures/isochrone'
import type { Job, Service, ServiceInput } from './types'

const stubInput: ServiceInput = {
  route_slug: 'sf-sj',
  name: 'Northbound Express',
  stops: [
    { name: 'SF', lat: 37.77, lng: -122.41, seq: 0 },
    { name: 'SJ', lat: 37.33, lng: -121.88, seq: 1 },
  ],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1.1, deceleration_ms2: 1.2, dwell_s: 30 },
  frequency_windows: [{ start_time: '06:00', end_time: '22:00', headway_s: 3600 }],
}

const stubService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'route-1',
  name: stubInput.name,
  stops: stubInput.stops,
  vehicle: stubInput.vehicle,
  frequency_windows: stubInput.frequency_windows,
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

describe('services CRUD', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('listServices GETs /api/services', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => [stubService] } as Response)
    const result = await listServices()
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services')
    expect((init as RequestInit | undefined)?.method ?? 'GET').toBe('GET')
    expect(result).toEqual([stubService])
  })

  it('fetchMyServices GETs /api/services, same as listServices', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => [stubService] } as Response)
    const result = await fetchMyServices()
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services')
    expect((init as RequestInit | undefined)?.method ?? 'GET').toBe('GET')
    expect(result).toEqual([stubService])
  })

  it('fetchService GETs /api/services/{slug}', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubService } as Response)
    await fetchService('northbound-express')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/services/northbound-express')
  })

  it('createService POSTs a JSON body to /api/services', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubService } as Response)
    await createService(stubInput)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(stubInput)
  })

  it('updateService PUTs a JSON body to /api/services/{slug}', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubService } as Response)
    await updateService('northbound-express', stubInput)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services/northbound-express')
    expect((init as RequestInit).method).toBe('PUT')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(stubInput)
  })

  it('deleteService DELETEs and resolves void', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    const result = await deleteService('northbound-express')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services/northbound-express')
    expect((init as RequestInit).method).toBe('DELETE')
    expect(result).toBeUndefined()
  })

  it('throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    await expect(listServices()).rejects.toThrow()
  })

  it('compileService POSTs to /api/services/{slug}/compile and returns the queued job', async () => {
    const stubJob: Job = { id: 'job1', kind: 'compile_user_service', status: 'queued' }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 202, json: async () => stubJob } as Response)
    const result = await compileService('northbound-express')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services/northbound-express/compile')
    expect((init as RequestInit).method).toBe('POST')
    expect(result).toEqual(stubJob)
  })
  it('fetchServiceGraph GETs /api/services/{slug}/graph', async () => {
    const graph = { services: [], routes: [] }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => graph } as Response)
    const result = await fetchServiceGraph('northbound-express')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services/northbound-express/graph')
    expect(result).toEqual(graph)
  })

  // A 404 here means "never compiled", which the detail page acts on by firing
  // a compile — so it has to arrive as a status the caller can branch on.
  it('fetchServiceGraph surfaces a 404 as an ApiError when nothing is compiled yet', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'no compiled graph for this service yet' }),
    } as Response)
    await expect(fetchServiceGraph('northbound-express')).rejects.toMatchObject({ status: 404 } satisfies Partial<ApiError>)
  })

  it('fetchServiceIsochrone POSTs to /api/services/{slug}/isochrone with the request body', async () => {
    enqueueThenSucceed()
    const result = await fetchServiceIsochrone('northbound-express', { lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/services/northbound-express/isochrone')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({ lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk' })
    expect(result).toEqual(stubChain)
  })

  // The endpoint answers 202 with a routing job now (SPA-182), so the result
  // arrives from the poll rather than from the POST.
  it('fetchServiceIsochrone polls the routing job the enqueue answered with', async () => {
    enqueueThenSucceed()
    await fetchServiceIsochrone('northbound-express', { lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk' })
    const [url] = vi.mocked(fetch).mock.calls[1]
    expect(url).toContain('/api/routing-jobs/rj1')
  })

  // The stale-graph check runs before anything is enqueued, so this is still
  // answered by the POST itself — which is what keeps useAuthoredGraph's
  // recompile-and-retry recovery working untouched.
  it('fetchServiceIsochrone surfaces a stale_graph ApiError code on 409', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'compiled graph is stale', code: 'stale_graph' }),
    } as Response)
    await expect(
      fetchServiceIsochrone('northbound-express', { lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk' }),
    ).rejects.toMatchObject({ code: 'stale_graph' } satisfies Partial<ApiError>)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })
})
