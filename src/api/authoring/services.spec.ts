import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listServices,
  fetchMyServices,
  fetchService,
  createService,
  updateService,
  deleteService,
  compileService,
} from './services'
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
})
