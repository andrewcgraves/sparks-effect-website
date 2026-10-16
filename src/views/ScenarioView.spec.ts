import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, mount, flushPromises } from '@vue/test-utils'
import ScenarioView from './ScenarioView.vue'
import { seriousA11yViolations } from '../test/axe'
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
  useScenario: (slug: string) => ({ subtext: ref(''), ...mockUseScenario(slug) }),
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
import { hopCells } from '../test/stationTimes'

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

// v-show hides with an inline display: none somewhere up the tree.
function shown(element: Element): boolean {
  return !element.closest('[style*="display: none"]')
}

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

  it('has no serious or critical accessibility violations with a splash zone plotted', async () => {
    vi.mocked(fetchIsochrone).mockResolvedValue(stubIsochrone)
    const router = await testRouterAt(`/scenario/ca-hsr?at=${NEARBY_ORIGIN.lat},${NEARBY_ORIGIN.lng}&mode=walk&mins=30`)
    const wrapper = mount(ScenarioView, {
      props: { slug: 'ca-hsr' },
      global: { stubs: { MapView: true }, plugins: [router] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(fetchIsochrone).toHaveBeenCalled()
    expect(await seriousA11yViolations(wrapper)).toEqual([])
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

  it('shows the subtext under the name and keeps the description\'s paragraph breaks', () => {
    mockUseScenario.mockReturnValue({
      name: ref('CA HSR'),
      subtext: ref('Electrified · High-speed rail · Greenfield'),
      description: ref('San Francisco to Anaheim.\n\nSources: CAHSR.'),
      routes: ref([]),
      stations: ref(stubStations),
      services: ref([]),
      loading: ref(false),
    })
    const wrapper = mountScenarioView()
    expect(wrapper.get('hgroup [data-testid="scenario-subtext"]').text()).toBe('Electrified · High-speed rail · Greenfield')
    const description = wrapper.get('[data-testid="scenario-description"]')
    expect(description.classes()).toContain('whitespace-pre-line')
    expect(description.element.textContent).toContain('Anaheim.\n\nSources')
  })

  it('shows no subtext line when the scenario has none', () => {
    const wrapper = mountScenarioView()
    expect(wrapper.find('[data-testid="scenario-subtext"]').exists()).toBe(false)
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
      "Couldn't plot this splash zone. Please try again.",
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
    const section = wrapper.get('[data-testid="stations"]')
    expect(hopCells(section)[0]).toEqual(['San Francisco', 'San Jose', '40:45'])
  })

  // The fixture is one symmetric hop on one route: nothing to toggle between,
  // and with no route name the group is titled by the stations at its ends.
  it('offers no direction toggle for a scenario of one symmetric corridor', async () => {
    const wrapper = mountScenarioView()
    await flushPromises()
    expect(wrapper.find('[data-testid="direction-toggle"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="station-time-group-label"]').text()).toBe('San Francisco – San Jose')
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

    it('draws one group per route, each headed with the line it belongs to', async () => {
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
      expect(groups[0].findAll('[data-testid="direction-toggle"] label').map((b) => b.text()))
        .toEqual(['To Anaheim', 'To San Francisco'])
      expect(groups[1].findAll('[data-testid="direction-toggle"] label').map((b) => b.text()))
        .toEqual(['To Las Vegas', 'To Palmdale'])
    })

    // Each row has to start where the row above it ended. The flat reverse put
    // a hop out of Anaheim directly under a hop arriving at Palmdale.
    it('reads the return direction back along the same line, with no jump', async () => {
      const wrapper = mountScenarioView()
      await flushPromises()
      const mainline = wrapper.findAll('[data-testid="station-time-group"]')[0]
      await mainline.get('[data-testid="direction-toggle-option-1"]').setValue(true)
      expect(hopCells(mainline))
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

  // SPA-504: one card reads the network in line order before a plot and after
  // it, where Time remaining and Time between stations used to sit stacked.
  describe('the Stations card', () => {
    const corridor: TravelTimes = {
      ...stubTravelTimes,
      segments: [
        { from: 'sf', to: 'sj', run_seconds: 2445 },
        { from: 'sj', to: 'gilroy', run_seconds: 900, reverse_run_seconds: 960 },
      ],
    }

    // Boarded at San Francisco, rode to San Jose, ran out halfway to Gilroy.
    const corridorIsochrone: ChainResponse = {
      ...stubIsochrone,
      metadata: {
        ...stubIsochrone.metadata,
        origin_budget_mins: 120,
        reachable_stations: [
          { station_slug: 'sf', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
          {
            station_slug: 'sj',
            access_mins: 5,
            access_secs: 300,
            remaining_mins: 70,
            remaining_secs: 4200,
            predecessor_slug: 'sf',
            board_slug: 'sf',
            legs: [{ from: 'sf', to: 'sj', service_id: 'svc-trunk', secs: 2445, dwell_s: 60 }],
          },
        ],
        trip_progress: [{
          from: 'sj',
          to: 'gilroy',
          route_id: 'route-1',
          service_id: 'svc-trunk',
          fraction: 0.5,
          from_chainage_m: 0,
          to_chainage_m: 1,
          remaining_secs: 0,
          ride_secs: 900,
        }],
      },
    }

    function leftColumn(wrapper: ReturnType<typeof mountScenarioView>): string[] {
      return wrapper.findAll('[data-testid="station-time-left"]').map((cell) => visibleText(cell).trim())
    }

    function stationRow(wrapper: ReturnType<typeof mountScenarioView>, name: string) {
      return wrapper.findAll('[data-testid="station-time-stop"]')
        .find((row) => row.get('[data-testid="station-time-stop-name"]').text() === name)!
    }

    async function corridorPage(plotted = true) {
      vi.mocked(fetchScenarioTravelTimes).mockResolvedValue(corridor)
      vi.mocked(fetchIsochrone).mockResolvedValue(corridorIsochrone)
      const wrapper = mountScenarioView()
      await flushPromises()
      if (plotted) {
        await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
          ...NEARBY_ORIGIN,
          duration: 120,
          mode: 'walk',
        })
        await flushPromises()
      }
      return wrapper
    }

    it('replaces both of the old cards, before a plot and after one', async () => {
      const before = await corridorPage(false)
      const after = await corridorPage()
      for (const wrapper of [before, after]) {
        expect(wrapper.find('[data-testid="stations"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="time-remaining"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="time-between-stations"]').exists()).toBe(false)
      }
    })

    it('reads as the timetable before a plot: run times, a direction toggle, no time left', async () => {
      const wrapper = await corridorPage(false)

      expect(hopCells(wrapper)).toEqual([
        ['San Francisco', 'San Jose', '40:45'],
        ['San Jose', 'Gilroy', '15:00'],
      ])
      expect(wrapper.find('[data-testid="direction-toggle"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="station-time-group-summary"]').text()).toBe('3 stops · 56 min')
      expect(wrapper.find('[data-testid="station-time-left"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="stations-plot-summary"]').exists()).toBe(false)
    })

    it('adds the time left on arrival after a plot, in the same line order', async () => {
      const wrapper = await corridorPage()

      expect(wrapper.findAll('[data-testid="station-time-stop-name"]').map((n) => n.text()))
        .toEqual(['San Francisco', 'San Jose', 'Gilroy'])
      expect(leftColumn(wrapper)).toEqual(['1h 55m', '1h 10m', '—'])
      expect(wrapper.get('[data-testid="station-time-group-summary"]').text()).toBe('2 of 3 reached')
      expect(wrapper.get('[data-testid="stations-plot-summary"]').text())
        .toBe('Starting point · Walk · 2h 0m travel time')
    })

    it('reads each hop the way it was ridden, and how far an unfinished one got', async () => {
      const wrapper = await corridorPage()

      expect(wrapper.find('[data-testid="direction-toggle"]').exists()).toBe(false)
      expect(hopCells(wrapper)).toEqual([
        ['San Francisco', 'San Jose', '↓ 40:45'],
        ['San Jose', 'Gilroy', '↓ 50% of 15:00'],
      ])
    })

    it('marks the station boarded from the starting point', async () => {
      const wrapper = await corridorPage()

      expect(stationRow(wrapper, 'San Francisco').findAll('[data-testid="station-time-stop-note"]').map((n) => n.text()))
        .toEqual(['Boarded here · 5m from starting point'])
    })

    it('hands the map the same time left the card shows', async () => {
      const wrapper = await corridorPage()
      const remainingSecs = wrapper.findComponent({ name: 'MapView' }).props('remainingSecs') as
        (slug: string) => number | null

      expect(formatTimeRemaining(remainingSecs('sj')!)).toBe(leftColumn(wrapper)[1])
    })

    it('raises a hovered station to the map and opens what its number hides', async () => {
      const wrapper = await corridorPage()

      await stationRow(wrapper, 'San Jose').trigger('mouseenter')

      expect(wrapper.findComponent({ name: 'MapView' }).props('activeStation')).toBe('sj')
      expect(stationRow(wrapper, 'San Jose').get('[data-testid="time-remaining-detail"]').text())
        .toContain('Rode in from San Francisco')
    })

    it('opens a station hovered on the map and scrolls it into view inside the card', async () => {
      const wrapper = await corridorPage()
      const list = wrapper.get('[data-testid="station-time-group"]').element.parentElement as HTMLElement
      const row = stationRow(wrapper, 'San Jose').element as HTMLElement
      list.getBoundingClientRect = () => ({ top: 100, bottom: 300 }) as DOMRect
      row.getBoundingClientRect = () => ({ top: 340, bottom: 380 }) as DOMRect

      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sj')
      await flushPromises()

      expect(list.scrollTop).toBe(80)
      expect(stationRow(wrapper, 'San Jose').find('[data-testid="time-remaining-detail"]').exists()).toBe(true)
    })

    it('falls back to the time-remaining graph when there are no run times to read a plot along', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchScenarioTravelTimes).mockRejectedValue(new Error('down'))
      vi.mocked(fetchIsochrone).mockResolvedValue(corridorIsochrone)
      const wrapper = mountScenarioView()
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        ...NEARBY_ORIGIN,
        duration: 120,
        mode: 'walk',
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="stations"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="time-remaining"]').exists()).toBe(true)
    })

    it('scrolls its own list beside the desktop map', async () => {
      const wrapper = await corridorPage()
      const list = wrapper.get('[data-testid="station-time-group"]').element.parentElement as HTMLElement

      expect(list.className).toContain('overflow-y-auto')
      expect(list.className).toContain('max-h-')
    })

    // SPA-508: the list used to scroll inside the scrolling phone panel, and a
    // swipe that started on it stopped at the list's end.
    describe('in the phone panel', () => {
      beforeEach(() => {
        window.innerWidth = 390
      })

      afterEach(() => {
        window.innerWidth = 1024
      })

      function lists(wrapper: ReturnType<typeof mountScenarioView>) {
        return {
          panel: wrapper.get('[data-testid="phone-panel-scroller"]').element as HTMLElement,
          list: wrapper.get('[data-testid="station-time-group"]').element.parentElement as HTMLElement,
        }
      }

      it('leaves the scrolling to the panel', async () => {
        const wrapper = await corridorPage()
        const { list } = lists(wrapper)

        expect(list.className).not.toContain('overflow-y-auto')
        expect(list.className).not.toContain('max-h-')
      })

      it('scrolls the panel, not the list, to a station picked on the map', async () => {
        const wrapper = await corridorPage()
        const { panel, list } = lists(wrapper)
        panel.getBoundingClientRect = () => ({ top: 100, bottom: 300 }) as DOMRect
        ;(stationRow(wrapper, 'San Jose').element as HTMLElement).getBoundingClientRect =
          () => ({ top: 340, bottom: 380 }) as DOMRect

        await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sj')
        await flushPromises()

        expect(panel.scrollTop).toBe(80)
        expect(list.scrollTop).toBe(0)
      })

      // Hidden by v-show, the row measures as a zero box at the top of the
      // viewport, which would read as "above the panel" and scroll the Plot tab.
      it('leaves the tab in view where it was when the station is on another tab', async () => {
        const wrapper = await corridorPage(false)
        const { panel } = lists(wrapper)
        panel.getBoundingClientRect = () => ({ top: 100, bottom: 300 }) as DOMRect
        panel.scrollTop = 120

        await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sj')
        await flushPromises()

        expect(panel.scrollTop).toBe(120)
      })
    })
  })

  describe('picking the origin on the map', () => {
    it('arms MapView with an origin cue when IsochroneForm emits pick-armed', async () => {
      const wrapper = mountScenarioView()
      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(false)

      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('pick-armed', true)

      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(true)
      expect(wrapper.findComponent({ name: 'MapView' }).props('placementCue')).toBe('Click the map to set the starting point — Esc to cancel')
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

    // SPA-501: the form and the saved splash zones were two boxes with two
    // headings, and how to move between them was unclear.
    it('shares one panel with the form: one heading, one box', async () => {
      vi.mocked(listPrerenderedIsochrones).mockResolvedValue([prerendered])
      const wrapper = mountScenarioView('ca-hsr', { MapView: true })
      await flushPromises()

      const panels = wrapper.findAll('[data-testid="plot-panel"]')
      expect(panels).toHaveLength(1)
      expect(panels[0].findAll('h2').map((h) => h.text())).toEqual(['Plot a splash zone'])
      expect(panels[0].find('[data-testid="prerendered-isochrones"]').exists()).toBe(true)
      expect(panels[0].find('form').classes()).not.toContain('border')
    })

    it('opens on Plot your own, with the saved splash zones one switch away', async () => {
      vi.mocked(listPrerenderedIsochrones).mockResolvedValue([prerendered])
      const wrapper = mountScenarioView('ca-hsr', { MapView: true })
      await flushPromises()

      expect(shown(wrapper.get('form').element)).toBe(true)
      expect(shown(wrapper.get('[data-testid="plot-saved"]').element)).toBe(false)

      await wrapper.get('[data-testid="plot-source-option-saved"]').setValue(true)

      expect(shown(wrapper.get('form').element)).toBe(false)
      expect(shown(wrapper.get('[data-testid="plot-saved"]').element)).toBe(true)
    })

    it('fills the form with the picked entry, and moves the pin to its starting point', async () => {
      const wrapper = await pickFirstEntry()

      expect((wrapper.get('[data-testid="lat"]').element as HTMLInputElement).value).toBe('37.7749')
      expect((wrapper.get('[data-testid="lng"]').element as HTMLInputElement).value).toBe('-122.4194')
      expect((wrapper.get('[data-testid="duration-slider-option-30"]').element as HTMLInputElement).checked)
        .toBe(true)
      expect((wrapper.get('[data-testid="mode-walk"]').element as HTMLInputElement).checked).toBe(true)
      expect(wrapper.findComponent({ name: 'MapView' }).props('origin'))
        .toEqual({ lat: 37.7749, lng: -122.4194 })
    })

    it('is a single form with no switch for a network that ships none', async () => {
      const wrapper = mountScenarioView('ca-hsr', { MapView: true })
      await flushPromises()

      expect(wrapper.find('[data-testid="plot-source"]').exists()).toBe(false)
      expect(shown(wrapper.get('form').element)).toBe(true)
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
    it('fills the Stations card from the picked chain', async () => {
      const wrapper = await pickFirstEntry()

      expect(wrapper.findAll('[data-testid="station-time-left"]').map((cell) => visibleText(cell).trim()))
        .toEqual(['25m', '—'])
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

    it('says so, opens on the saved splash zones, and puts an explanation where the form was', async () => {
      vi.mocked(fetchRoutingStatus).mockResolvedValue('offline')
      vi.mocked(listPrerenderedIsochrones).mockResolvedValue([saved])

      const wrapper = await mountWithOrigin()

      expect(wrapper.get('[data-testid="routing-status"]').text())
        .toBe('Live routing is offline right now. Here are some saved splash zones.')
      expect(shown(wrapper.get('[data-testid="plot-saved"]').element)).toBe(true)
      expect(shown(wrapper.get('[data-testid="plot-own"]').element)).toBe(false)

      await wrapper.get('[data-testid="plot-source-option-plot"]').setValue(true)

      expect(wrapper.get('[data-testid="plot-unavailable"]').text())
        .toContain('isn’t available right now')
      expect(shown(wrapper.get('form').element)).toBe(false)
      expect(plotButton(wrapper).disabled).toBe(true)
    })

    // One outage, one colour: the banner and the panel's explanation are the
    // same caution, so the page never shows the condition as an error as well.
    it('shows the banner and the explanation in the same caution, with no alert', async () => {
      vi.mocked(fetchRoutingStatus).mockResolvedValue('offline')
      vi.mocked(listPrerenderedIsochrones).mockResolvedValue([saved])

      const wrapper = await mountWithOrigin()
      await wrapper.get('[data-testid="plot-source-option-plot"]').setValue(true)

      for (const testid of ['routing-status', 'plot-unavailable']) {
        const notice = wrapper.get(`[data-testid="${testid}"]`)
        expect(notice.attributes('role')).toBe('status')
        expect(notice.classes()).toEqual(expect.arrayContaining(['border-apricot', 'bg-apricot/15']))
      }
      expect(wrapper.find('[data-testid="plot-panel"] [role="alert"]').exists()).toBe(false)
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
        .toBe('Live routing is offline right now. Here are some saved splash zones.')
    })

    it('only explains, without promising examples, for a network that ships none', async () => {
      vi.mocked(fetchRoutingStatus).mockResolvedValue('offline')

      const wrapper = await mountWithOrigin()

      const banner = wrapper.get('[data-testid="routing-status"]').text()
      expect(banner).toContain('Live routing is offline right now.')
      expect(banner).not.toContain('saved splash zones')
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
      await wrapper.findComponent({ name: 'PrerenderedIsochrones' }).vm.$emit('select', {
        id: 'pre-1',
        label: 'Downtown SF, 30 min walk',
        lat: 37.7749,
        lng: -122.4194,
        budget_mins: 30,
        mode: 'walk',
        outdated: false,
        created_at: '2026-08-01T12:00:00Z',
        result: stubIsochrone,
      } satisfies PrerenderedIsochrone)
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({})
      expect(wrapper.find('[data-testid="copy-link"]').exists()).toBe(false)
    })
  })

  // SPA-429: below md the page gives the screen to the map and moves its
  // controls into a tabbed panel, so a shared link opened on a phone can be
  // plotted and read without scrolling.
  describe('on a phone', () => {
    const reachedIsochrone: ChainResponse = {
      ...stubIsochrone,
      metadata: {
        ...stubIsochrone.metadata,
        reachable_stations: [
          { station_slug: 'sf', access_mins: 5, access_secs: 300, remaining_mins: 25, remaining_secs: 1500 },
        ],
      },
    }

    beforeEach(() => {
      window.innerWidth = 390
    })

    afterEach(() => {
      window.innerWidth = 1024
    })

    function tabLabels(wrapper: ReturnType<typeof mountScenarioView>) {
      return wrapper.findAll('[role="tab"]').map((tab) => tab.text())
    }

    function tabNamed(wrapper: ReturnType<typeof mountScenarioView>, label: string) {
      return wrapper.findAll('[role="tab"]').find((tab) => tab.text() === label)!
    }

    it('has no serious or critical accessibility violations with a splash zone plotted', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValue(reachedIsochrone)
      const router = await testRouterAt(`/scenario/ca-hsr?at=${NEARBY_ORIGIN.lat},${NEARBY_ORIGIN.lng}&mode=walk&mins=30`)
      const wrapper = mount(ScenarioView, {
        props: { slug: 'ca-hsr' },
        global: { stubs: { MapView: true }, plugins: [router] },
        attachTo: document.body,
      })
      await flushPromises()
      expect(wrapper.find('[data-testid="phone-map-page"]').exists()).toBe(true)
      expect(await seriousA11yViolations(wrapper)).toEqual([])
    })

    it('shows the map with the controls in a tabbed panel instead of the stacked page', () => {
      const wrapper = mountScenarioView()
      expect(wrapper.find('[data-testid="phone-map-page"]').exists()).toBe(true)
      expect(wrapper.get('h1').text()).toBe('CA HSR')
      expect(tabLabels(wrapper)).toEqual(['Plot', 'Stations', 'About'])
      expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'IsochroneForm' }).exists()).toBe(true)
      expect(wrapper.findAll('h2').map((h) => h.text())).not.toContain('Description')
    })

    it('holds the title line with a skeleton until the network loads', () => {
      mockUseScenario.mockReturnValue({
        name: ref(''),
        description: ref(''),
        routes: ref([]),
        stations: ref([]),
        services: ref([]),
        loading: ref(true),
      })
      const wrapper = mountScenarioView()
      expect(wrapper.find('h1').exists()).toBe(false)
      expect(wrapper.find('[data-testid="phone-map-page"] [aria-busy="true"]').exists()).toBe(true)
    })

    it('keeps the stacked page on a desktop', () => {
      window.innerWidth = 1024
      const wrapper = mountScenarioView()
      expect(wrapper.find('[data-testid="phone-map-page"]').exists()).toBe(false)
      expect(wrapper.findAll('h2').map((h) => h.text())).toContain('Description')
    })

    it('opens on Plot with the timetable behind Stations, then turns to Stations on a plot', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValue(reachedIsochrone)
      const wrapper = mountScenarioView()
      await flushPromises()
      expect(tabNamed(wrapper, 'Plot').attributes('aria-selected')).toBe('true')
      expect(tabNamed(wrapper, 'Stations').attributes('disabled')).toBeUndefined()

      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        ...NEARBY_ORIGIN,
        duration: 30,
        mode: 'walk',
      })
      await flushPromises()

      expect(tabNamed(wrapper, 'Stations').attributes('aria-selected')).toBe('true')
      const results = wrapper.get('[data-testid="stations"]')
      expect(visibleText(results.get('[data-testid="station-time-left"]')).trim()).toBe('25m')
      expect((results.element.closest('[role="tabpanel"]') as HTMLElement).style.display).not.toBe('none')
    })

    // A refused plot clears the splash zone and says why in the form, so a
    // panel left on the Stations tab would hide the explanation.
    it('returns to Plot when a later plot is refused', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValue(reachedIsochrone)
      const wrapper = mountScenarioView()
      const form = wrapper.findComponent({ name: 'IsochroneForm' })
      await form.vm.$emit('submit', { ...NEARBY_ORIGIN, duration: 30, mode: 'walk' })
      await flushPromises()
      expect(tabNamed(wrapper, 'Stations').attributes('aria-selected')).toBe('true')

      await form.vm.$emit('submit', { ...DISTANT_ORIGIN, duration: 30, mode: 'walk' })
      await flushPromises()

      expect(tabNamed(wrapper, 'Plot').attributes('aria-selected')).toBe('true')
      expect(form.props('error')).toContain('nearest station')
    })

    it('turns back to Stations for a second plot made from the Plot tab', async () => {
      vi.mocked(fetchIsochrone).mockResolvedValue(reachedIsochrone)
      const wrapper = mountScenarioView()
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        ...NEARBY_ORIGIN,
        duration: 30,
        mode: 'walk',
      })
      await flushPromises()
      await tabNamed(wrapper, 'Plot').trigger('click')
      expect(tabNamed(wrapper, 'Plot').attributes('aria-selected')).toBe('true')

      vi.mocked(fetchIsochrone).mockResolvedValue({ ...reachedIsochrone, features: [] })
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
        ...NEARBY_ORIGIN,
        duration: 45,
        mode: 'walk',
      })
      await flushPromises()

      expect(tabNamed(wrapper, 'Stations').attributes('aria-selected')).toBe('true')
    })

    it('puts the time between stations behind the Stations tab', async () => {
      const wrapper = mountScenarioView()
      await flushPromises()
      await tabNamed(wrapper, 'Stations').trigger('click')
      const card = wrapper.get('[data-testid="stations"]')
      expect((card.element.closest('[role="tabpanel"]') as HTMLElement).style.display).not.toBe('none')
    })

    it('puts the description behind the About tab, and drops the tab without one', async () => {
      const wrapper = mountScenarioView()
      await tabNamed(wrapper, 'About').trigger('click')
      expect(wrapper.text()).toContain('California High-Speed Rail')

      mockUseScenario.mockReturnValue({
        name: ref('CA HSR'),
        description: ref('   '),
        routes: ref([]),
        stations: ref(stubStations),
        services: ref([]),
        loading: ref(false),
      })
      expect(tabLabels(mountScenarioView())).toEqual(['Plot', 'Stations'])
    })

    it('puts the subtext behind the About tab too, keeping the tab for a scenario with only a subtext', async () => {
      mockUseScenario.mockReturnValue({
        name: ref('CA HSR'),
        subtext: ref('Electrified · High-speed rail · Greenfield'),
        description: ref(''),
        routes: ref([]),
        stations: ref(stubStations),
        services: ref([]),
        loading: ref(false),
      })
      const wrapper = mountScenarioView()
      expect(tabLabels(wrapper)).toEqual(['Plot', 'Stations', 'About'])
      await tabNamed(wrapper, 'About').trigger('click')
      expect(wrapper.get('[data-testid="scenario-subtext"]').text()).toBe('Electrified · High-speed rail · Greenfield')
      expect(wrapper.find('[data-testid="scenario-description"]').exists()).toBe(false)
    })
  })
})
