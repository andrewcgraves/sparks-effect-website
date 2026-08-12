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
  {
    id: 'st3',
    scenario_id: 's1',
    slug: 'gilroy',
    name: 'Gilroy',
    location: { type: 'Point', coordinates: [-121.57, 37.0] },
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

    // happy-dom implements no scrolling. The card no longer calls this at all,
    // and one case below is here to keep it that way — a stub rather than the
    // real thing so a call would be caught rather than silently ignored.
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

    // The detail used to grow the row it belonged to, which reflowed the list
    // under the pointer and moved every row below the one being read.
    it('shows the detail out of the list flow, so no row resizes', async () => {
      const wrapper = await plot()

      await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('mouseenter')

      const tip = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
        .get('[data-testid="time-remaining-detail"]').element.parentElement
      expect(tip?.className).toContain('fixed')
      // Nothing about the row animates open any more.
      expect(wrapper.html()).not.toContain('grid-rows-[0fr]')
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

    // happy-dom lays nothing out, so the geometry the card measures is stated
    // here: a list showing rows between y=100 and y=300, and a row sitting 80px
    // below the foot of it.
    function placeBelowTheFold(wrapper: ReturnType<typeof mountScenarioView>, index: number) {
      const list = wrapper.get('[data-testid="time-remaining"] ul').element as HTMLElement
      const row = wrapper.findAll('[data-testid="time-remaining-row"]')[index].element as HTMLElement
      list.getBoundingClientRect = () => ({ top: 100, bottom: 300 }) as DOMRect
      row.getBoundingClientRect = () => ({ top: 340, bottom: 380 }) as DOMRect
      return list
    }

    it('scrolls a map-originated row into view, and one of its own never', async () => {
      const wrapper = await plot()
      const list = placeBelowTheFold(wrapper, 1)

      await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('mouseenter')
      await flushPromises()
      expect(list.scrollTop).toBe(0)

      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sf')
      await flushPromises()
      expect(list.scrollTop).toBe(80)
    })

    // scrollIntoView scrolls every scrollable ancestor an element has, the
    // window included, so a map hover used to yank the page down to wherever
    // this card sat.
    it('never scrolls the page under the rider pointing at the map', async () => {
      const wrapper = await plot()
      placeBelowTheFold(wrapper, 1)

      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sf')
      await flushPromises()

      expect(scrollIntoView).not.toHaveBeenCalled()
    })

    // The connectors used to sit in a scroller, which clipped the bottom of a
    // branch behind the scrollbar and put far lanes out of sight entirely.
    it('never puts the connectors behind a scrollbar', async () => {
      const wrapper = await plot()

      expect(wrapper.find('[data-graph-scroller]').exists()).toBe(false)
      expect(wrapper.html()).not.toContain('overflow-x-auto')
    })

    // San Francisco branching two ways, which is the only shape that puts a
    // second lane on the page and so the only one that draws a fork bar.
    const branchingIsochrone: ChainResponse = {
      ...journeyIsochrone,
      metadata: {
        ...journeyIsochrone.metadata,
        reachable_stations: [
          ...journeyIsochrone.metadata.reachable_stations,
          {
            station_slug: 'gilroy',
            access_mins: 5,
            access_secs: 300,
            remaining_mins: 70,
            remaining_secs: 4200,
            predecessor_slug: 'sf',
            board_slug: 'sf',
            board_wait_secs: 600,
            legs: [{ from: 'sf', to: 'gilroy', service_id: 'svc-trunk', secs: 1500, dwell_s: 60 }],
          },
        ],
      },
    }

    it('branches along a bar level with the node, then drops down each lane', async () => {
      const wrapper = await plot(branchingIsochrone)
      const sf = wrapper.findAll('[data-testid="time-remaining-row"]')
        .find((row) => row.text().includes('San Francisco'))

      expect(sf).toBeDefined()
      // One bar joining the lanes the branches leave for...
      expect(sf!.findAll('span.h-px')).toHaveLength(1)
      // ...and a drop down each of them, held to the row's bottom edge so it
      // stretches as the row expands rather than being redrawn at a new angle.
      const drops = sf!.findAll('span.w-px')
        .filter((line) => line.attributes('style')?.includes('bottom: 0'))
      expect(drops).toHaveLength(2)
      // No diagonal, so nothing about the branch depends on the row's height.
      expect(sf!.html()).not.toContain('<svg')
    })

    // A scenario with a spur: the rider rides the trunk to San Jose and
    // changes there for the branch line.
    const twoServiceIsochrone: ChainResponse = {
      ...journeyIsochrone,
      metadata: {
        ...journeyIsochrone.metadata,
        reachable_stations: [
          ...journeyIsochrone.metadata.reachable_stations,
          {
            station_slug: 'gilroy',
            access_mins: 5,
            access_secs: 300,
            remaining_mins: 60,
            remaining_secs: 3600,
            predecessor_slug: 'sj',
            board_slug: 'sf',
            board_wait_secs: 600,
            legs: [
              { from: 'sf', to: 'sj', service_id: 'svc-trunk', secs: 900, dwell_s: 60 },
              { from: 'sj', to: 'gilroy', service_id: 'svc-spur', secs: 1800, dwell_s: 30 },
            ],
          },
        ],
      },
    }

    it('offers a switcher between the lines, opening on the first service', () => {
      return plot(twoServiceIsochrone).then((wrapper) => {
        const labels = wrapper.findAll('[data-testid="time-remaining-service"] label').map((l) => l.text())
        expect(labels).toEqual(['Walk', 'svc-trunk', 'svc-spur'])
        // The trunk, not the walk it is listed after.
        expect(wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text()))
          .toEqual(expect.arrayContaining([expect.stringContaining('San Jose')]))
      })
    })

    it('cuts to the line chosen, showing that one alone', () => {
      return plot(twoServiceIsochrone).then(async (wrapper) => {
        await wrapper.find('[data-testid="time-remaining-service-option-2"]').setValue()

        const names = wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text())
        expect(names.some((text) => text.includes('Gilroy'))).toBe(true)
        // San Francisco belongs to the trunk's story, not the spur's.
        expect(names.some((text) => text.includes('San Francisco'))).toBe(false)
      })
    })

    it('cuts to the line a station hovered on the map is on', async () => {
      const wrapper = await plot(twoServiceIsochrone)
      expect(wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text())
        .some((text) => text.includes('Gilroy'))).toBe(false)

      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'gilroy')
      await flushPromises()

      expect(wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text())
        .some((text) => text.includes('Gilroy'))).toBe(true)
    })

    it('offers no switcher when the trip is over one line', async () => {
      const wrapper = await plot({
        ...journeyIsochrone,
        metadata: {
          ...journeyIsochrone.metadata,
          reachable_stations: [journeyIsochrone.metadata.reachable_stations[0]],
        },
      })

      expect(wrapper.find('[data-testid="time-remaining-service"]').exists()).toBe(false)
    })

    // The same trip, told to a page that knows both services run over one
    // railway. That knowledge is the whole difference between two tabs and one.
    function servicesShareOneLine() {
      const service = (id: string, name: string) => ({
        id,
        route_id: 'route-1',
        name,
        vehicle_type: { id: 'vt-1', name: 'HSR', propulsion: 'electric', max_speed_kmh: 350 },
        direction: 'both',
        provenance: 'calibrated' as const,
        stop_count: 3,
        frequency_windows: [],
      })
      mockUseScenario.mockReturnValue({
        name: ref('CA HSR'),
        description: ref('California High-Speed Rail'),
        routes: ref([{
          id: 'route-1',
          scenario_id: 's1',
          name: 'CA HSR Phase 1 — San Francisco to Anaheim',
          mode: 'rail',
          geometry: { type: 'LineString' as const, coordinates: [] },
          bidirectional: true,
        }]),
        stations: ref(stubStations),
        services: ref([service('svc-trunk', 'HSR Local'), service('svc-spur', 'HSR Express')]),
      })
    }

    it('offers one tab per railway, not one per timetable', async () => {
      servicesShareOneLine()
      const wrapper = await plot(twoServiceIsochrone)

      const labels = wrapper.findAll('[data-testid="time-remaining-service"] label').map((l) => l.text())
      expect(labels).toEqual(['Walk', 'CA HSR Phase 1'])
    })

    it('draws the two services as branches of that one line, each row naming its own', async () => {
      servicesShareOneLine()
      const wrapper = await plot(twoServiceIsochrone)

      // Both stations on one tab, where before they were a tab apart.
      const names = wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text())
      expect(names.some((text) => text.includes('San Jose'))).toBe(true)
      expect(names.some((text) => text.includes('Gilroy'))).toBe(true)
      // The line is one railway; which train is still the row's own business.
      expect(wrapper.findAll('[data-testid="time-remaining-flag"]').map((f) => f.text()))
        .toEqual(['Walk', 'HSR Local', 'HSR Express'])
    })

    it('sits above the station times, being the answer to what was just asked', async () => {
      const wrapper = await plot()
      const html = wrapper.html()
      const remaining = html.indexOf('data-testid="time-remaining"')
      const between = html.indexOf('data-testid="time-between-stations"')

      // Both on the page, or the comparison below proves nothing: a card that
      // is absent reports -1, which comes before everything.
      expect(remaining).toBeGreaterThanOrEqual(0)
      expect(between).toBeGreaterThanOrEqual(0)
      expect(remaining).toBeLessThan(between)
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
