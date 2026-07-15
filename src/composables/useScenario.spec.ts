import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useScenario } from './useScenario'
import type { ScenarioDetail } from '../api/scenarios'

vi.mock('../api/scenarios', () => ({
  fetchScenario: vi.fn(),
}))

import { fetchScenario } from '../api/scenarios'

const stubDetail: ScenarioDetail = {
  id: 's1',
  slug: 'ca-hsr',
  name: 'CA HSR',
  description: 'California High-Speed Rail',
  status: 'active',
  routes: [
    {
      id: 'r1',
      scenario_id: 's1',
      name: 'Main Line',
      mode: 'hsr',
      geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
      bidirectional: true,
    },
  ],
  stations: [
    {
      id: 'st1',
      scenario_id: 's1',
      slug: 'sf',
      name: 'San Francisco',
      location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      platform_height: '0',
    },
  ],
  services: [
    {
      id: 'svc1',
      name: 'Northbound Express',
      vehicle_type: {
        id: 'vt1',
        name: 'High-Speed Rail',
        propulsion: 'electric',
        max_speed_kmh: 320,
      },
      direction: 'northbound',
      provenance: 'calibrated',
      stop_count: 2,
      frequency_windows: [
        { id: 'fw1', service_id: 'svc1', start_time: '06:00', end_time: '22:00', headway_s: 3600 },
      ],
    },
  ],
}

describe('useScenario', () => {
  beforeEach(() => {
    vi.mocked(fetchScenario).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls fetchScenario with the given slug', () => {
    vi.mocked(fetchScenario).mockResolvedValueOnce(stubDetail)
    useScenario('ca-hsr')
    expect(fetchScenario).toHaveBeenCalledOnce()
    expect(fetchScenario).toHaveBeenCalledWith('ca-hsr')
  })

  it('starts with empty name, description, routes, stations, and services', () => {
    vi.mocked(fetchScenario).mockResolvedValueOnce(stubDetail)
    const { name, description, routes, stations, services } = useScenario('ca-hsr')
    expect(name.value).toBe('')
    expect(description.value).toBe('')
    expect(routes.value).toEqual([])
    expect(stations.value).toEqual([])
    expect(services.value).toEqual([])
  })

  it('populates name after fetch resolves', async () => {
    vi.mocked(fetchScenario).mockResolvedValueOnce(stubDetail)
    const { name } = useScenario('ca-hsr')
    await flushPromises()
    expect(name.value).toBe(stubDetail.name)
  })

  it('populates description after fetch resolves', async () => {
    vi.mocked(fetchScenario).mockResolvedValueOnce(stubDetail)
    const { description } = useScenario('ca-hsr')
    await flushPromises()
    expect(description.value).toBe(stubDetail.description)
  })

  it('populates routes after fetch resolves', async () => {
    vi.mocked(fetchScenario).mockResolvedValueOnce(stubDetail)
    const { routes } = useScenario('ca-hsr')
    await flushPromises()
    expect(routes.value).toEqual(stubDetail.routes)
  })

  it('populates stations after fetch resolves', async () => {
    vi.mocked(fetchScenario).mockResolvedValueOnce(stubDetail)
    const { stations } = useScenario('ca-hsr')
    await flushPromises()
    expect(stations.value).toEqual(stubDetail.stations)
  })

  it('populates services after fetch resolves', async () => {
    vi.mocked(fetchScenario).mockResolvedValueOnce(stubDetail)
    const { services } = useScenario('ca-hsr')
    await flushPromises()
    expect(services.value).toEqual(stubDetail.services)
  })

  it('leaves refs empty when fetch rejects', async () => {
    vi.mocked(fetchScenario).mockRejectedValueOnce(new Error('network error'))
    const { name, description, routes, stations, services } = useScenario('ca-hsr')
    await flushPromises()
    expect(name.value).toBe('')
    expect(description.value).toBe('')
    expect(routes.value).toEqual([])
    expect(stations.value).toEqual([])
    expect(services.value).toEqual([])
  })
})
