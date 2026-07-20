import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listScenarios,
  fetchMyScenarios,
  fetchScenario,
  createScenario,
  updateScenario,
  deleteScenario,
} from './scenarios'
import type { Scenario, ScenarioInput } from './types'

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

describe('scenarios CRUD', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('listScenarios GETs /api/scenarios', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => [stubScenario] } as Response)
    const result = await listScenarios()
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/scenarios')
    expect(result).toEqual([stubScenario])
  })

  it('fetchMyScenarios GETs /api/me/scenarios', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => [stubScenario] } as Response)
    const result = await fetchMyScenarios()
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/me/scenarios')
    expect(result).toEqual([stubScenario])
  })

  it('fetchScenario GETs /api/scenarios/{slug}', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubScenario } as Response)
    await fetchScenario('ca-hsr')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/scenarios/ca-hsr')
  })

  it('createScenario POSTs a body containing service_ids', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubScenario } as Response)
    await createScenario(stubInput)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/scenarios')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.service_ids).toEqual(['svc1', 'svc2'])
  })

  it('updateScenario PUTs a body containing service_ids', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => stubScenario } as Response)
    await updateScenario('ca-hsr', stubInput)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/scenarios/ca-hsr')
    expect((init as RequestInit).method).toBe('PUT')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.service_ids).toEqual(['svc1', 'svc2'])
  })

  it('deleteScenario DELETEs and resolves void', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    const result = await deleteScenario('ca-hsr')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/scenarios/ca-hsr')
    expect((init as RequestInit).method).toBe('DELETE')
    expect(result).toBeUndefined()
  })

  it('throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    await expect(listScenarios()).rejects.toThrow()
  })
})
