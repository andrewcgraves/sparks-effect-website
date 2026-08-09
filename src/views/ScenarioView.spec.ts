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

// A pin about 1.4 km from the San Francisco station above — inside a 30-minute
// walk, so the origin-range check (SPA-200) lets it through. The tests that use
// it are about the request lifecycle rather than about how far away the origin
// is, and a pin the check refuses never reaches the request at all.
const NEARBY_ORIGIN = { lat: 37.71, lng: -122.41 }

// Far enough from every station that no mode or budget the form offers could
// reach one.
const DISTANT_ORIGIN = { lat: 51.5074, lng: -0.1278 }

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
    compile_job_id: 'compile-1',
    mode: 'walk',
    wait_model: 'half-headway',
    origin_iso_available: true,
  },
}

function mountScenarioView(slug = 'ca-hsr', stubs: Record<string, boolean> = { MapView: true, IsochroneForm: true }) {
  return mount(ScenarioView, {
    props: { slug },
    global: { stubs },
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
      ...NEARBY_ORIGIN,
      duration: 30,
      mode: 'walk',
    })
    expect(fetchIsochrone).toHaveBeenCalledOnce()
    expect(fetchIsochrone).toHaveBeenCalledWith({
      ...NEARBY_ORIGIN,
      budget_mins: 30,
      mode: 'walk',
      scenario_slug: 'ca-hsr',
    })
  })

  it('forwards the selected mode from the form payload to fetchIsochrone', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const wrapper = mountScenarioView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      ...NEARBY_ORIGIN,
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
      ...NEARBY_ORIGIN,
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
      ...NEARBY_ORIGIN,
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
      ...NEARBY_ORIGIN,
      duration: 30,
      mode: 'walk',
    })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
    expect(wrapper.findComponent({ name: 'IsochroneForm' }).props('error')).toBe(
      'Failed to generate isochrone. Please try again.',
    )
  })

  // SPA-200. The point of checking here is that the request is never made: a
  // far-away origin used to cost a routing job row, a queue message carrying the
  // whole compiled graph, and a slot on a worker that plots one chain at a time.
  describe('an origin out of range of every station', () => {
    async function submitDistantOrigin(mode = 'walk', duration = 30) {
      const wrapper = mountScenarioView()
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        ...DISTANT_ORIGIN,
        duration,
        mode,
      })
      await flushPromises()
      return wrapper
    }

    it('is refused without asking the API', async () => {
      await submitDistantOrigin()
      expect(fetchIsochrone).not.toHaveBeenCalled()
    })

    it('explains the distance rather than reporting a failure', async () => {
      const wrapper = await submitDistantOrigin()
      const error = wrapper.findComponent({ name: 'IsochroneForm' }).props('error') as string
      expect(error).toContain('nearest station')
      expect(error).toContain('30-minute walk')
      expect(error).not.toContain('try again')
    })

    it('leaves the map idle rather than spinning', async () => {
      const wrapper = await submitDistantOrigin()
      expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
      expect(wrapper.findComponent({ name: 'IsochroneForm' }).props('loading')).toBe(false)
      expect(wrapper.findComponent({ name: 'MapView' }).props('isochroneData')).toBeNull()
    })

    // The check is against this origin and this budget, not against the origin
    // alone — otherwise it would be refusing a place rather than a request.
    it('still asks the API once the budget covers the distance', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
      const wrapper = mountScenarioView()
      // London is ~8600 km from the fixture's stations, which nothing reaches;
      // moving the pin to 100 km out puts it inside a two-hour drive.
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        lat: 37.7 + 100 / 111.19,
        lng: -122.4,
        duration: 120,
        mode: 'drive',
      })
      await flushPromises()
      expect(fetchIsochrone).toHaveBeenCalledOnce()
    })
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

  describe('picking the origin on the map', () => {
    it('arms MapView with an origin cue when IsochroneForm emits pick-armed', async () => {
      const wrapper = mountScenarioView()
      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(false)

      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('pick-armed', true)

      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(true)
      expect(wrapper.findComponent({ name: 'MapView' }).props('placementCue')).toBe('Click the map to set origin — Esc to cancel')
    })

    it('disarms MapView when IsochroneForm reports the pick is over', async () => {
      const wrapper = mountScenarioView()
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('pick-armed', true)
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('pick-armed', false)

      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(false)
    })

    it('feeds a map click back into the form as the origin', async () => {
      const wrapper = mountScenarioView('ca-hsr', { MapView: true })
      await wrapper.find('[data-testid="pick-on-map"]').trigger('click')

      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('map-click', { lat: 45.5231, lng: -122.6784 })

      expect((wrapper.find('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('45.5231')
      expect((wrapper.find('input[data-testid="lng"]').element as HTMLInputElement).value).toBe('-122.6784')
      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(false)
    })
  })

  describe('the Time remaining card', () => {
    // alpha --trunk--> beta, with beta forking on to gamma and delta. Enough
    // shape to see the graph fork, the flags, and a change of service.
    const journeyIsochrone: ChainResponse = {
      type: 'FeatureCollection',
      features: [],
      metadata: {
        reachable_stations: [
          { station_slug: 'sf', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
          {
            station_slug: 'sj',
            access_mins: 5,
            access_secs: 300,
            remaining_mins: 90,
            remaining_secs: 5400,
            predecessor_slug: 'sf',
            board_slug: 'sf',
            board_wait_secs: 600,
            legs: [{ from: 'sf', to: 'sj', service_id: 'svc-trunk', secs: 900, dwell_s: 60 }],
          },
        ],
        origin_budget_mins: 120,
        compile_job_id: 'compile-1',
        mode: 'walk',
        wait_model: 'headway_over_2_peak',
        origin_iso_available: true,
      },
    }

    // happy-dom implements no scrolling, and the card scrolls a map-originated
    // row into view — so it is stubbed for every case here, not only the one
    // that asserts on it.
    const scrollIntoView = vi.fn()
    beforeEach(() => {
      scrollIntoView.mockClear()
      Element.prototype.scrollIntoView = scrollIntoView
    })

    async function plot(isochrone: ChainResponse = journeyIsochrone) {
      vi.mocked(fetchIsochrone).mockResolvedValue(isochrone)
      const wrapper = mountScenarioView()
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        ...NEARBY_ORIGIN,
        duration: 120,
        mode: 'walk',
      })
      await flushPromises()
      return wrapper
    }

    it('is absent until a plot has succeeded', () => {
      const wrapper = mountScenarioView()
      expect(wrapper.find('[data-testid="time-remaining"]').exists()).toBe(false)
    })

    it('stays absent while a plot is still computing, rather than flashing a skeleton', async () => {
      vi.mocked(fetchIsochrone).mockImplementation(() => new Promise(() => {}))
      const wrapper = mountScenarioView()
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        ...NEARBY_ORIGIN,
        duration: 120,
        mode: 'walk',
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="time-remaining"]').exists()).toBe(false)
    })

    it('renders the starting location and every station reached, in countdown order', async () => {
      const wrapper = await plot()

      const rows = wrapper.findAll('[data-testid="time-remaining-row"]')
      expect(rows.map((row) => row.get('[data-testid="time-remaining-value"]').text()))
        .toEqual(['2h 0m', '1h 45m', '1h 30m'])
      expect(rows[0].text()).toContain('Starting location')
      expect(rows[1].text()).toContain('San Francisco')
      expect(rows[2].text()).toContain('San Jose')
    })

    it('flags how the rider leaves each row, and leaves the end of a branch unflagged', async () => {
      const wrapper = await plot()

      const flags = wrapper.findAll('[data-testid="time-remaining-row"]')
        .map((row) => row.find('[data-testid="time-remaining-flag"]'))
      expect(flags[0].text()).toBe('Walk')
      expect(flags[1].text()).toBe('svc-trunk')
      expect(flags[2].exists()).toBe(false)
    })

    it('expands a row on hover, with the detail its single number hides', async () => {
      const wrapper = await plot()
      const row = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
      expect(row.find('[data-testid="time-remaining-detail"]').exists()).toBe(false)

      await row.trigger('mouseenter')

      const detail = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
        .get('[data-testid="time-remaining-detail"]').text()
      expect(detail).toContain('Arrived with')
      expect(detail).toContain('Dwell')
      expect(detail).toContain('Ride in')
    })

    it('expands a row on focus too, so the detail is reachable from the keyboard', async () => {
      const wrapper = await plot()

      await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('focus')

      expect(wrapper.findAll('[data-testid="time-remaining-row"]')[2]
        .find('[data-testid="time-remaining-detail"]').exists()).toBe(true)
    })

    it('expands only one row at a time', async () => {
      const wrapper = await plot()
      const rows = () => wrapper.findAll('[data-testid="time-remaining-row"]')

      await rows()[1].trigger('mouseenter')
      await rows()[2].trigger('mouseenter')

      expect(wrapper.findAll('[data-testid="time-remaining-detail"]')).toHaveLength(1)
    })

    it('raises the hovered row all the way to the map', async () => {
      const wrapper = await plot()

      await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('mouseenter')

      expect(wrapper.findComponent({ name: 'MapView' }).props('activeStation')).toBe('sj')
    })

    it('takes a station hovered on the map back and expands its row', async () => {
      const wrapper = await plot()

      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sj')

      const row = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
      expect(row.find('[data-testid="time-remaining-detail"]').exists()).toBe(true)
    })

    it('scrolls a map-originated row into view, and one of its own never', async () => {
      const wrapper = await plot()

      await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('mouseenter')
      await flushPromises()
      expect(scrollIntoView).not.toHaveBeenCalled()

      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sf')
      await flushPromises()
      expect(scrollIntoView).toHaveBeenCalled()
    })

    it('draws a lone reachable station as a two-row graph', async () => {
      const wrapper = await plot({
        ...journeyIsochrone,
        metadata: {
          ...journeyIsochrone.metadata,
          reachable_stations: [journeyIsochrone.metadata.reachable_stations[0]],
        },
      })

      expect(wrapper.findAll('[data-testid="time-remaining-row"]')).toHaveLength(2)
    })
  })
})
