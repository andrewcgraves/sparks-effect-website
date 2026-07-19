import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listServices,
  fetchService,
  createService,
  updateService,
  deleteService,
} from './services'
import type { Service, ServiceInput } from './types'

const stubInput: ServiceInput = {
  name: 'Northbound Express',
  stops: [
    { lat: 37.77, lng: -122.41, name: 'SF', seq: 0 },
    { lat: 37.33, lng: -121.88, name: 'SJ', seq: 1 },
  ],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1.1, deceleration_ms2: 1.2, dwell_s: 30 },
  frequency_windows: [{ start_time: '06:00', end_time: '22:00', headway_s: 3600 }],
}

const stubService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  provenance: 'computed',
  ...stubInput,
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
})
