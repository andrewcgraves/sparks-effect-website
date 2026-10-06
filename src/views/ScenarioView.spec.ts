import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, mount, flushPromises } from '@vue/test-utils'
import ScenarioView from './ScenarioView.vue'
import { ref } from 'vue'
import type { Router } from 'vue-router'
import { testRouter, testRouterAt } from '../test/router'

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

vi.mock('../api/prerenderedIsochrones', () => ({
  listPrerenderedIsochrones: vi.fn(),
  fetchPrerenderedIsochrone: vi.fn(),
}))

vi.mock('../api/routingStatus', () => ({ fetchRoutingStatus: vi.fn() }))

import { fetchIsochrone } from '../api/isochrone'
import { fetchRoutingStatus } from '../api/routingStatus'
import { fetchScenarioTravelTimes } from '../api/scenarios'
import {
  fetchPrerenderedIsochrone,
  listPrerenderedIsochrones,
} from '../api/prerenderedIsochrones'
import type { Route, Station, TravelTimes } from '../api/scenarios'
import type { PrerenderedIsochrone } from '../api/prerenderedIsochrones'
import type { ChainResponse } from '../fixtures/isochrone'
import { formatTimeRemaining } from '../components/timeRemaining'
import { busyRegion, visibleText } from '../test/loading'

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

const NEARBY_ORIGIN = { lat: 37.71, lng: -122.41 }

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

function mountScenarioView(
  slug = 'ca-hsr',
  stubs: Record<string, boolean> = { MapView: true, IsochroneForm: true },
  router: Router = testRouter(),
) {
  return mount(ScenarioView, {
    props: { slug },
    global: { stubs, plugins: [router] },
  })
}

async function mountScenarioViewAt(path: string, stubs: Record<string, boolean> = { MapView: true }) {
  const router = await testRouterAt(path)
  const wrapper = mountScenarioView('ca-hsr', stubs, router)
  await flushPromises()
  return { wrapper, router }
}

enableAutoUnmount(afterEach)

describe('ScenarioView', () => {
  beforeEach(() => {
    vi.mocked(fetchRoutingStatus).mockReset().mockResolvedValue('ok')
    vi.mocked(fetchIsochrone).mockClear()
    vi.mocked(fetchScenarioTravelTimes).mockReset().mockResolvedValue(stubTravelTimes)
    // Most of this page's cases are about the generate form; a scenario with no
    // pre-rendered isochrones is the quiet default, and the block at the foot
    // of the file is where they are stocked.
    vi.mocked(listPrerenderedIsochrones).mockReset().mockResolvedValue([])
    vi.mocked(fetchPrerenderedIsochrone).mockReset()
    mockUseScenario.mockReset()
    mockUseScenario.mockReturnValue({
      name: ref('CA HSR'),
      description: ref('California High-Speed Rail'),
      routes: ref([]),
      stations: ref(stubStations),
      services: ref([]),
      loading: ref(false),
    })
  })

  it('titles the page with the scenario name alone', () => {
    const wrapper = mountScenarioView()
    expect(wrapper.get('h1').text()).toBe('CA HSR')
  })

  it('holds the title line with a skeleton, not the fallback name, while the scenario loads', () => {
    mockUseScenario.mockReturnValue({
      name: ref(''),
      description: ref(''),
      routes: ref([]),
      stations: ref([]),
      services: ref([]),
      loading: ref(true),
    })
    const wrapper = mountScenarioView()
    const region = busyRegion(wrapper, 'scenario-title-loading')
    expect(visibleText(region)).toBe('')
    expect(wrapper.find('h1').exists()).toBe(false)
  })

  it('names the tab after the scenario once its name arrives', async () => {
    const name = ref('')
    mockUseScenario.mockReturnValue({
      name,
      description: ref(''),
      routes: ref([]),
      stations: ref(stubStations),
      services: ref([]),
    })
    document.title = 'Network · Sparks Effect'
    mountScenarioView()
    expect(document.title).toBe('Network · Sparks Effect')

    name.value = 'CA HSR'
    await flushPromises()
    expect(document.title).toBe('CA HSR · Sparks Effect')
  })

  it('carries no hard-coded tagline under the name', () => {
    const wrapper = mountScenarioView()
    expect(wrapper.text()).not.toContain('Electrified')
    expect(wrapper.text()).not.toContain('Greenfield')
  })

  it('has no Technology assumptions placeholder section', () => {
    const wrapper = mountScenarioView()
    const headings = wrapper.findAll('h2').map((h) => h.text())
    expect(headings).not.toContain('Technology assumptions')
    expect(wrapper.text()).not.toContain('Placeholder')
  })

  it('renders the scenario description', () => {
    const wrapper = mountScenarioView()
    expect(wrapper.findAll('h2').map((h) => h.text())).toContain('Description')
    expect(wrapper.text()).toContain('California High-Speed Rail')
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', '   \n\t'],
  ])('hides the Description section when the description is %s', (_, description) => {
    mockUseScenario.mockReturnValue({
      name: ref('CA HSR'),
      description: ref(description),
      routes: ref([]),
      stations: ref(stubStations),
      services: ref([]),
    })
    const wrapper = mountScenarioView()
    expect(wrapper.findAll('h2').map((h) => h.text())).not.toContain('Description')
    expect(wrapper.text()).not.toContain('—')
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

  // SPA-467: a visitor waiting on a queued plot is told where they stand.
  it('tells a waiting visitor how many plots are ahead of theirs', async () => {
    vi.mocked(fetchIsochrone).mockImplementation((_request, onProgress) => {
      onProgress?.({ status: 'queued', queue_position: 2 })
      return new Promise(() => {})
    })
    const wrapper = mountScenarioView('ca-hsr')
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      ...NEARBY_ORIGIN,
      duration: 30,
      mode: 'walk',
    })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'MapView' }).props('loadingMessage')).toBe('Waiting — 2 ahead of you')
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
    }, expect.any(Function))
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
      expect.any(Function),
    )
  })

  it('forwards transit mode from the form payload to fetchIsochrone', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const wrapper = mountScenarioView()
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      ...NEARBY_ORIGIN,
      duration: 30,
      mode: 'transit',
    })
    expect(fetchIsochrone).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'transit' }),
      expect.any(Function),
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

  // The fixture is one symmetric hop on one route: nothing to toggle between,
  // and one table needs no heading to be told apart from its neighbours.
  it('offers no direction toggle or heading for a scenario of one symmetric corridor', async () => {
    const wrapper = mountScenarioView()
    await flushPromises()
    expect(wrapper.find('[data-testid="direction-toggle"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="station-time-group-label"]').exists()).toBe(false)
  })

  // The shape the seeded ca-hsr payload actually has: a mainline, then a spur
  // appended after it that branches off a station in the middle of the
  // mainline rather than continuing from its terminus. Read as one flat list,
  // the toggle was headed with the spur's terminus over a table of the
  // mainline, and the return table jumped across the branch (SPA-245).
  describe('a scenario whose segments span several routes', () => {
    const branchingStations: Station[] = [
      ['sf', 'San Francisco'],
      ['sj', 'San Jose'],
      ['palmdale', 'Palmdale'],
      ['anaheim', 'Anaheim'],
      ['victor-valley', 'Victor Valley'],
      ['las-vegas', 'Las Vegas'],
    ].map(([slug, name], i) => ({
      id: `st${i}`,
      scenario_id: 's1',
      slug,
      name,
      location: { type: 'Point', coordinates: [-120, 36] },
      platform_height: '0',
    }))

    const branchingRoutes: Route[] = [
      { id: 'r-main', name: 'Phase 1' },
      { id: 'r-spur', name: 'Brightline West' },
    ].map(({ id, name }) => ({
      id,
      scenario_id: 's1',
      name,
      mode: 'rail',
      geometry: { type: 'LineString', coordinates: [] },
      bidirectional: true,
    }))

    beforeEach(() => {
      mockUseScenario.mockReturnValue({
        name: ref('CA HSR'),
        description: ref('California High-Speed Rail'),
        routes: ref(branchingRoutes),
        stations: ref(branchingStations),
        services: ref([]),
      })
      vi.mocked(fetchScenarioTravelTimes).mockResolvedValue({
        ...stubTravelTimes,
        segments: [
          { from: 'sf', to: 'sj', run_seconds: 1800, reverse_run_seconds: 1830, route_id: 'r-main' },
          { from: 'sj', to: 'palmdale', run_seconds: 2400, route_id: 'r-main' },
          { from: 'palmdale', to: 'anaheim', run_seconds: 1200, route_id: 'r-main' },
          { from: 'palmdale', to: 'victor-valley', run_seconds: 1050, route_id: 'r-spur' },
          { from: 'victor-valley', to: 'las-vegas', run_seconds: 5310, reverse_run_seconds: 5400, route_id: 'r-spur' },
        ],
      })
    })

    it('draws one table per route, each headed with the line it belongs to', async () => {
      const wrapper = mountScenarioView()
      await flushPromises()
      const groups = wrapper.findAll('[data-testid="station-time-group"]')
      expect(groups.map((g) => g.get('[data-testid="station-time-group-label"]').text()))
        .toEqual(['Phase 1', 'Brightline West'])
    })

    it('names each toggle after the terminus of its own line', async () => {
      const wrapper = mountScenarioView()
      await flushPromises()
      const groups = wrapper.findAll('[data-testid="station-time-group"]')
      expect(groups[0].findAll('[data-testid="direction-toggle"]').map((b) => b.text()))
        .toEqual(['To Anaheim', 'To San Francisco'])
      expect(groups[1].findAll('[data-testid="direction-toggle"]').map((b) => b.text()))
        .toEqual(['To Las Vegas', 'To Palmdale'])
    })

    // Each row has to start where the row above it ended. The flat reverse put
    // a hop out of Anaheim directly under a hop arriving at Palmdale.
    it('reads the return direction back along the same line, with no jump', async () => {
      const wrapper = mountScenarioView()
      await flushPromises()
      const mainline = wrapper.findAll('[data-testid="station-time-group"]')[0]
      await mainline.findAll('[data-testid="direction-toggle"]')[1].trigger('click')
      expect(mainline.findAll('[data-testid="station-time-row"]')
        .map((row) => row.findAll('td').map((td) => td.text())))
        .toEqual([
          ['Anaheim', 'Palmdale', '20:00'],
          ['Palmdale', 'San Jose', '40:00'],
          ['San Jose', 'San Francisco', '30:30'],
        ])
    })
  })

  it('shows a run-time skeleton while the travel times are in flight', async () => {
    vi.mocked(fetchScenarioTravelTimes).mockReturnValue(new Promise(() => {}))
    const wrapper = mountScenarioView()
    expect(wrapper.get('[data-testid="station-times-loading"]').attributes('aria-busy')).toBe('true')
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
      expect(detail).toContain('Stopped here for')
      expect(detail).toContain('Rode in from San Francisco')
    })

    // The detail is a journey, so it reads in the order the rider lives it:
    // the leg in, what that left them with, then the stop served here.
    it('reads the detail in the order the rider travels it', async () => {
      const wrapper = await plot()

      await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('mouseenter')

      const terms = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
        .get('[data-testid="time-remaining-detail"]')
        .findAll('dt').map((term) => term.text())
      expect(terms).toEqual(['Rode in from San Francisco', 'Arrived with', 'Stopped here for'])
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

    it('hands the map the same remaining number the card shows for that station', async () => {
      const wrapper = await plot()
      const remainingSecs = wrapper.findComponent({ name: 'MapView' }).props('remainingSecs') as
        (slug: string) => number | null
      const sf = wrapper.findAll('[data-testid="time-remaining-row"]')
        .find((row) => row.attributes('data-station-slug') === 'sf')
        ?.get('[data-testid="time-remaining-value"]').text()

      expect(formatTimeRemaining(remainingSecs('sf')!)).toBe(sf)
      expect(remainingSecs('nowhere')).toBeNull()
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
        .find((row) => row.attributes('data-station-slug') === 'sf')

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

    it('offers a switcher between the lines, opening on the first of them', () => {
      return plot(twoServiceIsochrone).then((wrapper) => {
        const labels = wrapper.findAll('[data-testid="time-remaining-service"] label').map((l) => l.text())
        // One tab per line and no tab for the walk to San Francisco, which the
        // trunk's own view already opens with (SPA-243).
        expect(labels).toEqual(['svc-trunk', 'svc-spur'])
        expect(wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text()))
          .toEqual(expect.arrayContaining([expect.stringContaining('San Jose')]))
      })
    })

    it('cuts to the line chosen, showing that one alone', () => {
      return plot(twoServiceIsochrone).then(async (wrapper) => {
        await wrapper.find('[data-testid="time-remaining-service-option-1"]').setValue()

        const slugs = wrapper.findAll('[data-testid="time-remaining-row"]')
          .map((r) => r.attributes('data-station-slug'))
        expect(slugs).toContain('gilroy')
        // San Francisco belongs to the trunk's story, not the spur's: it is
        // named on the starting location as where the walk went, not as a row.
        expect(slugs).not.toContain('sf')
      })
    })

    // SPA-342: San Jose is walked to as well, and the spur is boarded there
    // rather than by changing off the trunk. The search set off from both.
    const boardedApartIsochrone: ChainResponse = {
      ...journeyIsochrone,
      metadata: {
        ...journeyIsochrone.metadata,
        reachable_stations: [
          journeyIsochrone.metadata.reachable_stations[0],
          { station_slug: 'sj', access_mins: 20, access_secs: 1200, remaining_mins: 100, remaining_secs: 6000 },
          {
            station_slug: 'gilroy',
            access_mins: 20,
            access_secs: 1200,
            remaining_mins: 70,
            remaining_secs: 4200,
            predecessor_slug: 'sj',
            board_slug: 'sj',
            board_wait_secs: 600,
            legs: [{ from: 'sj', to: 'gilroy', service_id: 'svc-spur', secs: 1200 }],
          },
          {
            station_slug: 'sf-north',
            access_mins: 5,
            access_secs: 300,
            remaining_mins: 90,
            remaining_secs: 5400,
            predecessor_slug: 'sf',
            board_slug: 'sf',
            board_wait_secs: 600,
            legs: [{ from: 'sf', to: 'sf-north', service_id: 'svc-trunk', secs: 900 }],
          },
        ],
      },
    }

    it('names on the starting location the station the chosen line was boarded at', async () => {
      const wrapper = await plot(boardedApartIsochrone)
      const access = () => wrapper.findAll('[data-testid="time-remaining-access"]').map((a) => a.text())

      expect(access()).toEqual(['to San Francisco, 5m'])
      await wrapper.find('[data-testid="time-remaining-service-option-1"]').setValue()
      expect(access()).toEqual(['to San Jose, 20m'])
    })

    it('reads Walk, not Transit, where a transit access leg walked the whole way', async () => {
      const metadata = boardedApartIsochrone.metadata
      const wrapper = await plot({
        ...boardedApartIsochrone,
        metadata: {
          ...metadata,
          mode: 'transit',
          reachable_stations: metadata.reachable_stations.map((station) => ({
            ...station,
            access_rode_transit: (station.legs?.[0]?.from ?? station.station_slug) === 'sj',
          })),
        },
      })
      const origin = () => wrapper.findAll('[data-testid="time-remaining-row"]')[0]

      expect(origin().find('[data-testid="time-remaining-flag"]').text()).toBe('Walk')
      expect(origin().find('[data-testid="time-remaining-access"]').text()).toBe('to San Francisco, 5m')
      await wrapper.find('[data-testid="time-remaining-service-option-1"]').setValue()
      expect(origin().find('[data-testid="time-remaining-flag"]').text()).toBe('Transit')
      expect(origin().find('[data-testid="time-remaining-access"]').text()).toBe('to San Jose, 20m')
    })

    it('says how each access leg was covered when one line was reached both ways', async () => {
      const metadata = boardedApartIsochrone.metadata
      const wrapper = await plot({
        ...boardedApartIsochrone,
        metadata: {
          ...metadata,
          mode: 'transit',
          reachable_stations: metadata.reachable_stations.map((station) => ({
            ...station,
            legs: station.legs?.map((leg) => ({ ...leg, service_id: 'svc-trunk' })),
            access_rode_transit: (station.legs?.[0]?.from ?? station.station_slug) === 'sj',
          })),
        },
      })

      expect(wrapper.find('[data-testid="time-remaining-flag"]').text()).toBe('Transit')
      expect(wrapper.findAll('[data-testid="time-remaining-access"]').map((a) => a.text())).toEqual([
        'Walk to San Francisco, 5m',
        'Transit to San Jose, 20m',
      ])
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

      // Two services over one railway are one line, and one line is the whole
      // trip — so there is nothing left to switch between.
      expect(wrapper.find('[data-testid="time-remaining-service"]').exists()).toBe(false)
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
  // The pre-rendered list is a second way into the same map, so what matters
  // here is that a pick lands in the same place a generated chain does.
  describe('the pre-rendered isochrones card', () => {
    const prerendered: PrerenderedIsochrone = {
      id: 'pre-1',
      label: 'Downtown SF, 30 min walk',
      lat: 37.7749,
      lng: -122.4194,
      budget_mins: 30,
      mode: 'walk',
      outdated: false,
      created_at: '2026-08-01T12:00:00Z',
      result: {
        ...stubIsochrone,
        metadata: {
          ...stubIsochrone.metadata,
          compile_job_id: 'compile-prerendered',
          reachable_stations: [
            { station_slug: 'sf', access_mins: 5, access_secs: 300, remaining_mins: 25, remaining_secs: 1500 },
          ],
        },
      },
    }

    async function pickFirstEntry() {
      vi.mocked(listPrerenderedIsochrones).mockResolvedValue([prerendered])
      vi.mocked(fetchPrerenderedIsochrone).mockResolvedValue(prerendered)
      const wrapper = mountScenarioView('ca-hsr', { MapView: true })
      await flushPromises()
      await wrapper.get('[data-testid="prerendered-entry"]').trigger('click')
      await flushPromises()
      return wrapper
    }

    it('marks the picked entry, and unmarks it once a new plot is asked for', async () => {
      const wrapper = await pickFirstEntry()

      expect(wrapper.get('[data-testid="prerendered-entry"]').attributes('aria-pressed')).toBe('true')

      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        lat: 37.7749,
        lng: -122.4194,
        duration: 30,
        mode: 'walk',
      })
      await flushPromises()

      expect(wrapper.get('[data-testid="prerendered-entry"]').attributes('aria-pressed')).toBe('false')
    })

    it('lists the isochrones this scenario ships, beside the generate form', async () => {
      vi.mocked(listPrerenderedIsochrones).mockResolvedValue([prerendered])
      const wrapper = mountScenarioView('ca-hsr', { MapView: true })
      await flushPromises()

      expect(listPrerenderedIsochrones).toHaveBeenCalledWith('ca-hsr')
      expect(wrapper.find('[data-testid="prerendered-isochrones"]').exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'IsochroneForm' }).exists()).toBe(true)
    })

    it('is absent for a scenario that ships none, leaving the form alone in the rail', async () => {
      const wrapper = mountScenarioView('ca-hsr', { MapView: true })
      await flushPromises()

      expect(wrapper.find('[data-testid="prerendered-isochrones"]').exists()).toBe(false)
      expect(wrapper.findComponent({ name: 'IsochroneForm' }).exists()).toBe(true)
    })

    it('draws a picked isochrone on the map, without asking the generation service', async () => {
      const wrapper = await pickFirstEntry()

      expect(fetchPrerenderedIsochrone).toHaveBeenCalledWith('pre-1')
      expect(fetchIsochrone).not.toHaveBeenCalled()
      expect(wrapper.findComponent({ name: 'MapView' }).props('isochroneData'))
        .toEqual(prerendered.result)
      expect(wrapper.findComponent({ name: 'MapView' }).props('loading')).toBe(false)
    })

    // The card reads isochroneData.metadata, so a pre-rendered chain has to
    // reach it by the same route a generated one does.
    it('fills the Time remaining card from the picked chain', async () => {
      const wrapper = await pickFirstEntry()

      const rows = wrapper.findAll('[data-testid="time-remaining-row"]')
      expect(rows).toHaveLength(2)
      expect(rows[1].text()).toContain('San Francisco')
    })

    it('clears a stale generation error, the picked chain being the answer now', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValue(new Error('API down'))
      vi.mocked(listPrerenderedIsochrones).mockResolvedValue([prerendered])
      vi.mocked(fetchPrerenderedIsochrone).mockResolvedValue(prerendered)
      const wrapper = mountScenarioView('ca-hsr', { MapView: true })
      await flushPromises()

      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        ...NEARBY_ORIGIN,
        duration: 30,
        mode: 'walk',
      })
      await flushPromises()
      expect(wrapper.findComponent({ name: 'IsochroneForm' }).props('error')).toBeTruthy()

      await wrapper.get('[data-testid="prerendered-entry"]').trigger('click')
      await flushPromises()

      expect(wrapper.findComponent({ name: 'IsochroneForm' }).props('error')).toBeNull()
      expect(wrapper.findComponent({ name: 'MapView' }).props('isochroneData'))
        .toEqual(prerendered.result)
    })
  })

  describe('when live routing is offline', () => {
    const saved: PrerenderedIsochrone = {
      id: 'pre-1',
      label: 'Downtown SF, 30 min walk',
      lat: 37.7749,
      lng: -122.4194,
      budget_mins: 30,
      mode: 'walk',
      outdated: false,
      created_at: '2026-08-01T12:00:00Z',
      result: stubIsochrone,
    }

    async function mountWithOrigin() {
      const wrapper = mountScenarioView('ca-hsr', { MapView: true })
      await flushPromises()
      await wrapper.get('[data-testid="lat"]').setValue(String(NEARBY_ORIGIN.lat))
      await wrapper.get('[data-testid="lng"]').setValue(String(NEARBY_ORIGIN.lng))
      return wrapper
    }

    function plotButton(wrapper: Awaited<ReturnType<typeof mountWithOrigin>>) {
      return wrapper.get('button[type="submit"]').element as HTMLButtonElement
    }

    it('says so, disables Plot, and puts the saved examples ahead of the form', async () => {
      vi.mocked(fetchRoutingStatus).mockResolvedValue('offline')
      vi.mocked(listPrerenderedIsochrones).mockResolvedValue([saved])

      const wrapper = await mountWithOrigin()

      expect(wrapper.get('[data-testid="routing-status"]').text())
        .toBe('Live routing is offline right now. Here are some saved examples.')
      expect(plotButton(wrapper).disabled).toBe(true)
      const examples = wrapper.get('[data-testid="prerendered-isochrones"]').element
      const form = wrapper.get('form').element
      expect(examples.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('neither promises nor rules out examples until the list has answered', async () => {
      vi.mocked(fetchRoutingStatus).mockResolvedValue('offline')
      let answerList: (list: PrerenderedIsochrone[]) => void = () => {}
      vi.mocked(listPrerenderedIsochrones).mockReturnValue(new Promise((resolve) => (answerList = resolve)))

      const wrapper = await mountWithOrigin()
      expect(wrapper.get('[data-testid="routing-status"]').text()).toBe('Live routing is offline right now.')

      answerList([saved])
      await flushPromises()
      expect(wrapper.get('[data-testid="routing-status"]').text())
        .toBe('Live routing is offline right now. Here are some saved examples.')
    })

    it('only explains, without promising examples, for a network that ships none', async () => {
      vi.mocked(fetchRoutingStatus).mockResolvedValue('offline')

      const wrapper = await mountWithOrigin()

      const banner = wrapper.get('[data-testid="routing-status"]').text()
      expect(banner).toContain('Live routing is offline right now.')
      expect(banner).not.toContain('saved examples')
      expect(plotButton(wrapper).disabled).toBe(true)
    })

    it('behaves as if routing were fine when the status cannot be read', async () => {
      vi.mocked(fetchRoutingStatus).mockRejectedValue(new Error('network down'))
      vi.mocked(listPrerenderedIsochrones).mockResolvedValue([saved])

      const wrapper = await mountWithOrigin()

      expect(wrapper.find('[data-testid="routing-status"]').exists()).toBe(false)
      expect(plotButton(wrapper).disabled).toBe(false)
      const examples = wrapper.get('[data-testid="prerendered-isochrones"]').element
      const form = wrapper.get('form').element
      expect(examples.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    })
  })

  describe('a shareable isochrone', () => {
    const linked = '/scenario/ca-hsr?at=37.71,-122.41&mode=transit&mins=120'

    it('plots the origin, mode and budget a link names, once, as the page opens', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
      const { wrapper } = await mountScenarioViewAt(linked)
      expect(fetchIsochrone).toHaveBeenCalledTimes(1)
      expect(fetchIsochrone).toHaveBeenCalledWith({
        lat: 37.71,
        lng: -122.41,
        budget_mins: 120,
        mode: 'transit',
        scenario_slug: 'ca-hsr',
      }, expect.any(Function))
      expect((wrapper.get('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('37.71')
      expect((wrapper.get('input[data-testid="mode-transit"]').element as HTMLInputElement).checked).toBe(true)
      expect(wrapper.findComponent({ name: 'MapView' }).props('isochroneData')).toEqual(stubIsochrone)
    })

    it('waits for the scenario\'s stations, so a link out of range spends no routing job', async () => {
      const stations = ref<Station[]>([])
      mockUseScenario.mockReturnValue({
        name: ref('CA HSR'), description: ref(''), routes: ref([]), stations, services: ref([]),
      })
      const { wrapper, router } = await mountScenarioViewAt(
        `/scenario/ca-hsr?at=${DISTANT_ORIGIN.lat},${DISTANT_ORIGIN.lng}&mode=walk&mins=45`,
      )
      expect(fetchIsochrone).not.toHaveBeenCalled()

      stations.value = stubStations
      await flushPromises()
      expect(fetchIsochrone).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="fetch-error"]').exists()).toBe(true)
      expect(router.currentRoute.value.query).toEqual({})
      expect(wrapper.find('[data-testid="copy-link"]').exists()).toBe(false)
    })

    it('ignores a link it cannot read, leaving the form at its defaults', async () => {
      const { wrapper } = await mountScenarioViewAt('/scenario/ca-hsr?at=north&mode=teleport&mins=7')
      expect(fetchIsochrone).not.toHaveBeenCalled()
      expect((wrapper.get('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('')
      expect((wrapper.get('input[data-testid="mode-walk"]').element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get('input[data-testid="duration-slider-option-60"]').element as HTMLInputElement).checked).toBe(true)
      expect(wrapper.find('[data-testid="fetch-error"]').exists()).toBe(false)
    })

    it('puts what was plotted in the URL, and offers to copy it', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
      const { wrapper, router } = await mountScenarioViewAt('/scenario/ca-hsr')
      expect(wrapper.find('[data-testid="copy-link"]').exists()).toBe(false)

      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        lat: 37.712345678, lng: -122.41, duration: 45, mode: 'bike',
      })
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ at: '37.71235,-122.41', mode: 'bike', mins: '45' })
      expect(wrapper.find('[data-testid="copy-link"]').exists()).toBe(true)
    })

    it('leaves the URL alone when the plot fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchIsochrone).mockRejectedValue(new Error('API down'))
      const { wrapper, router } = await mountScenarioViewAt('/scenario/ca-hsr')
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        lat: 37.71, lng: -122.41, duration: 45, mode: 'bike',
      })
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({})
      expect(wrapper.find('[data-testid="copy-link"]').exists()).toBe(false)
    })

    it('stops naming a plotted isochrone once a pre-rendered one replaces it', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
      const { wrapper, router } = await mountScenarioViewAt(linked)
      await wrapper.findComponent({ name: 'PrerenderedIsochrones' }).vm.$emit('select', stubIsochrone)
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({})
      expect(wrapper.find('[data-testid="copy-link"]').exists()).toBe(false)
    })
  })
})
