import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ScenarioView from './ScenarioView.vue'
import { ref } from 'vue'

vi.mock('../api/isochrone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/isochrone')>()
  return {
    ...actual,
    fetchIsochrone: vi.fn(),
  }
})

const mockUseScenario = vi.fn()
vi.mock('../composables/useScenario', () => ({
  useScenario: (slug: string) => mockUseScenario(slug),
}))

vi.mock('../api/scenarios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/scenarios')>()
  return {
    ...actual,
    fetchScenarioTravelTimes: vi.fn(),
  }
})

import { fetchIsochrone } from '../api/isochrone'
import { fetchScenarioTravelTimes } from '../api/scenarios'
import type { Station, TravelTimes } from '../api/scenarios'
import type { ChainResponse } from '../fixtures/isochrone'

const stubStations: Station[] = [
  {
    id: 'st1',
    scenario_id: 's1',
    slug: 'sf',
    name: 'San Francisco',
    location: { type: 'Point', coordinates: [-122.4, 37.7] },
    platform_height: '0',
  },
  {
    id: 'st2',
    scenario_id: 's1',
    slug: 'sj',
    name: 'San Jose',
    location: { type: 'Point', coordinates: [-121.9, 37.3] },
    platform_height: '0',
  },
]

const stubTravelTimes: TravelTimes = {
  scenario_slug: 'ca-hsr',
  provenance: 'calibrated',
  source: 'seed',
  segments: [{ from: 'sf', to: 'sj', run_seconds: 2445 }],
}

const stubIsochrone: ChainResponse = {
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

function mountScenarioView(slug = 'ca-hsr') {
  return mount(ScenarioView, {
    props: { slug },
    global: { stubs: { MapView: true, IsochroneForm: true } },
  })
}

describe('ScenarioView', () => {
  beforeEach(() => {
    vi.mocked(fetchIsochrone).mockClear()
    vi.mocked(fetchScenarioTravelTimes).mockReset().mockResolvedValue(stubTravelTimes)
    mockUseScenario.mockReset()
    mockUseScenario.mockReturnValue({
      name: ref('CA HSR'),
      description: ref('California High-Speed Rail'),
      routes: ref([]),
      stations: ref(stubStations),
      services: ref([]),
    })
  })

  it('titles the page with the scenario name', () => {
    const wrapper = mountScenarioView()
    expect(wrapper.get('h1').text()).toBe('Route: CA HSR')
  })

  it('renders the scenario description', () => {
    const wrapper = mountScenarioView()
    expect(wrapper.text()).toContain('California High-Speed Rail')
  })

  it('calls useScenario with the slug prop', () => {
    mountScenarioView('ca-hsr')
    expect(mockUseScenario).toHaveBeenCalledWith('ca-hsr')
  })

  it('passes null isochroneData and loading=false to MapView before any submission', () => {
    const wrapper = mountScenarioView()
    const mapView = wrapper.findComponent({ name: 'MapView' })
    expect(mapView.props('isochroneData')).toBeNull()
    expect(mapView.props('loading')).toBe(false)
  })

  it('calls fetchIsochrone with the form payload and route slug on submit', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const wrapper = mountScenarioView('ca-hsr')
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'walk',
    })
    expect(fetchIsochrone).toHaveBeenCalledOnce()
    expect(fetchIsochrone).toHaveBeenCalledWith({
      lat: 51.5074,
      lng: -0.1278,
      budget_mins: 30,
      mode: 'walk',
      scenario_slug: 'ca-hsr',
    })
  })

  it('forwards the selected mode from the form payload to fetchIsochrone', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const wrapper = mountScenarioView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'bike',
    })
    expect(fetchIsochrone).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'bike' }),
    )
  })

  it('sets loading=true on MapView and IsochroneForm while the fetch is in flight', async () => {
    let resolveIsochrone!: (v: ChainResponse) => void
    vi.mocked(fetchIsochrone).mockReturnValue(
      new Promise<ChainResponse>((res) => { resolveIsochrone = res }),
    )
    const wrapper = mountScenarioView()
    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'walk',
    })
    await vi.waitFor(() => {
      expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(true)
    })
    expect(wrapper.findComponent({ name: 'IsochroneForm' }).props('loading')).toBe(true)
    resolveIsochrone(stubIsochrone)
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
    expect(wrapper.findComponent({ name: 'IsochroneForm' }).props('loading')).toBe(false)
  })

  it('passes isochrone data to MapView after successful fetch', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const wrapper = mountScenarioView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'walk',
    })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MapView' }).props('isochroneData')).toEqual(stubIsochrone)
    expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
  })

  it('clears loading state and threads the error into IsochroneForm when the fetch throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchIsochrone).mockRejectedValue(new Error('API down'))
    const wrapper = mountScenarioView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 51.5074,
      lng: -0.1278,
      duration: 30,
      mode: 'walk',
    })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
    expect(wrapper.findComponent({ name: 'IsochroneForm' }).props('error')).toBe(
      'Failed to generate isochrone. Please try again.',
    )
  })

  it('does not render a below-grid fetch-error element', () => {
    const wrapper = mountScenarioView()
    expect(wrapper.find('main > [data-testid="fetch-error"]').exists()).toBe(false)
  })

  it('passes origin to MapView when IsochroneForm emits origin-change', async () => {
    const wrapper = mountScenarioView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', { lat: 51.5074, lng: -0.1278 })
    expect(wrapper.findComponent({ name: 'MapView' }).props('origin')).toEqual({ lat: 51.5074, lng: -0.1278 })
  })

  it('shows the scenario travel times in place of the old speed-graph placeholder', async () => {
    const wrapper = mountScenarioView('ca-hsr')
    await flushPromises()
    expect(fetchScenarioTravelTimes).toHaveBeenCalledWith('ca-hsr')
    expect(wrapper.text()).not.toContain('Speed graph')
    const section = wrapper.get('[data-testid="time-between-stations"]')
    expect(section.get('[data-testid="station-time-row"]').findAll('td').map((td) => td.text()))
      .toEqual(['San Francisco', 'San Jose', '40:45'])
  })

  it('offers no direction toggle for seeded run times, which have one stored direction', async () => {
    const wrapper = mountScenarioView()
    await flushPromises()
    expect(wrapper.find('[data-testid="direction-toggle"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="station-time-group-label"]').exists()).toBe(false)
  })

  it('shows muted loading copy while the travel times are in flight', async () => {
    vi.mocked(fetchScenarioTravelTimes).mockReturnValue(new Promise(() => {}))
    const wrapper = mountScenarioView()
    expect(wrapper.get('[data-testid="station-times-loading"]').classes()).toContain('text-ink-muted')
  })

  it('logs and hides the section when the travel times fail, leaving the map usable', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchScenarioTravelTimes).mockRejectedValue(new Error('API down'))
    const wrapper = mountScenarioView()
    await flushPromises()
    expect(wrapper.find('[data-testid="time-between-stations"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'IsochroneForm' }).exists()).toBe(true)
    expect(logged).toHaveBeenCalled()
  })

  it('clears MapView origin when IsochroneForm emits origin-change with null', async () => {
    const wrapper = mountScenarioView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', { lat: 51.5074, lng: -0.1278 })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', null)
    expect(wrapper.findComponent({ name: 'MapView' }).props('origin')).toBeNull()
  })
})
