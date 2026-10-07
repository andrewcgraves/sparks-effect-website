import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { InterchangePair, Scenario, ScenarioInput, Service, TransitGraph } from '../api/authoring/types'
import { ApiError } from '../api/authoring/client'
import { sameInterchangePair } from '../api/authoring/scenarioInput'

vi.mock('../api/routingStatus', () => ({ fetchRoutingStatus: vi.fn().mockResolvedValue('ok') }))

vi.mock('../api/authoring/scenarios', () => ({
  fetchScenario: vi.fn(),
  fetchScenarioGraph: vi.fn(),
  compileScenario: vi.fn(),
  fetchScenarioIsochrone: vi.fn(),
  fetchMyScenarios: vi.fn(),
  deleteScenario: vi.fn(),
  updateScenario: vi.fn(),
}))
vi.mock('../api/authoring/services', () => ({
  fetchMyServices: vi.fn(),
}))
vi.mock('../components/MapView.vue', () => ({
  default: {
    props: ['origin', 'isochroneData', 'loading', 'loadingMessage', 'routes', 'stations'],
    template: '<div data-testid="map" :data-stations="stations.length" :data-routes="routes.length" :data-loading-message="loadingMessage" />',
  },
}))

import { breadcrumbTrail } from '../test/breadcrumbs'
import AuthoredScenarioView from './AuthoredScenarioView.vue'
import { seriousA11yViolations } from '../test/axe'
import {
  fetchScenario,
  fetchScenarioGraph,
  compileScenario,
  fetchScenarioIsochrone,
  deleteScenario,
  updateScenario,
} from '../api/authoring/scenarios'
import { useConfirmHost } from '../composables/useConfirm'
import { fetchMyServices } from '../api/authoring/services'
import { busyRegion, visibleText } from '../test/loading'

const Stub = { template: '<div>stub</div>' }

const stubScenario: Scenario = {
  id: 's1',
  slug: 'ca-hsr',
  name: 'CA HSR',
  description: 'California High-Speed Rail',
  service_ids: ['svc1'],
}

const graph = {
  services: [],
  merge: {
    clusters: [{ key: 'c1', names: ['Union', 'Union Sq'] }],
    near_misses: [{
      a: { name: 'Union', service_id: 'svc1' },
      b: { name: 'Midtown', service_id: 'svc2' },
      distance_m: 120.4,
    }],
  },
} as unknown as TransitGraph

function mountView(slug = 'ca-hsr') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/authoring', name: 'authoring', component: Stub },
      { path: '/authoring/scenarios/:slug', name: 'scenario-detail', component: AuthoredScenarioView, props: true },
      { path: '/authoring/scenarios/:slug/edit', name: 'edit-scenario', component: Stub },
    ],
  })
  return mount(AuthoredScenarioView, { props: { slug }, global: { plugins: [router] } })
}

describe('AuthoredScenarioView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchScenario).mockReset().mockResolvedValue(stubScenario)
    vi.mocked(fetchScenarioGraph).mockReset().mockResolvedValue(graph)
    vi.mocked(compileScenario).mockReset()
    vi.mocked(fetchMyServices).mockReset().mockResolvedValue([
      { id: 'svc2', slug: 'midtown-local', route_id: 'r1', name: 'Midtown Local', stops: [], vehicle: { max_speed_kmh: 100, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 }, frequency_windows: [] },
    ])
    vi.mocked(fetchScenarioIsochrone).mockReset()
    vi.mocked(deleteScenario).mockReset().mockResolvedValue()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'succeeded', result: graph }),
    } as Response))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('has no serious or critical accessibility violations once loaded', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/authoring', name: 'authoring', component: Stub },
        { path: '/authoring/scenarios/:slug', name: 'scenario-detail', component: AuthoredScenarioView, props: true },
        { path: '/authoring/scenarios/:slug/edit', name: 'edit-scenario', component: Stub },
      ],
    })
    const wrapper = mount(AuthoredScenarioView, { props: { slug: 'ca-hsr' }, global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })

  it('shows a page skeleton in the shape of the loaded page, not loading copy, while it loads', () => {
    vi.mocked(fetchScenario).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    const region = busyRegion(wrapper, 'scenario-loading')
    expect(region.find('[data-testid="map-panel-skeleton"]').exists()).toBe(true)
    expect(region.findAll('[data-testid="card-skeleton"]')).toHaveLength(1)
    expect(visibleText(region)).toBe('')
  })

  it('names the tab after the scenario once it loads', async () => {
    mountView()
    await flushPromises()
    expect(document.title).toBe('CA HSR · Sparks Effect')
  })

  it('loads the scenario named by the slug prop and shows its name', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(fetchScenario).toHaveBeenCalledWith('ca-hsr')
    expect(wrapper.text()).toContain('CA HSR')
    expect(wrapper.text()).toContain('ca-hsr')
  })

  it('shows the map and isochrone form for a scenario that already compiled', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(fetchScenarioGraph).toHaveBeenCalledWith('ca-hsr')
    expect(compileScenario).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'IsochroneForm' }).exists()).toBe(true)
  })

  it('compiles when the scenario has no graph yet', async () => {
    vi.mocked(fetchScenarioGraph).mockRejectedValue(new ApiError('no compiled graph', 404))
    vi.mocked(compileScenario).mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' })
    const wrapper = mountView()
    await flushPromises()
    expect(compileScenario).toHaveBeenCalledWith('ca-hsr', expect.any(Object))
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(true)
  })

  it('plots an isochrone against the scenario', async () => {
    vi.mocked(fetchScenarioIsochrone).mockResolvedValue({ features: [], metadata: { reachable_stations: [], mode: 'walk' } } as never)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 37.7, lng: -122.4, duration: 30, mode: 'walk',
    })
    await flushPromises()

    expect(fetchScenarioIsochrone).toHaveBeenCalledWith('ca-hsr', {
      lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'walk',
    }, expect.any(Function))
  })

  // SPA-467: a visitor waiting on a queued plot is told where they stand.
  it('tells a waiting visitor how many plots are ahead of theirs', async () => {
    vi.mocked(fetchScenarioIsochrone).mockImplementation((_slug, _request, onProgress) => {
      onProgress?.({ status: 'queued', queue_position: 2 })
      return new Promise(() => {})
    })
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 37.7, lng: -122.4, duration: 30, mode: 'walk',
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="map"]').attributes('data-loading-message')).toBe('Waiting — 2 ahead of you')
  })

  it('forwards transit mode when plotting an isochrone', async () => {
    vi.mocked(fetchScenarioIsochrone).mockResolvedValue({ features: [], metadata: { reachable_stations: [], mode: 'walk' } } as never)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 37.7, lng: -122.4, duration: 30, mode: 'transit',
    })
    await flushPromises()

    expect(fetchScenarioIsochrone).toHaveBeenCalledWith('ca-hsr', {
      lat: 37.7, lng: -122.4, budget_mins: 30, mode: 'transit',
    }, expect.any(Function))
  })

  it('hands the compiled graph to the map as station and route layers', async () => {
    vi.mocked(fetchScenarioGraph).mockResolvedValue({
      services: [{ service_id: 'svc1', wait_secs: 0, edges: [{ from_slug: 'a', to_slug: 'b', seconds: 60 }] }],
      nodes: [
        { slug: 'a', lat: 35.39, lng: -119.02, names: ['Test'] },
        { slug: 'b', lat: 34.05, lng: -118.23, names: ['Testt'] },
      ],
      routes: [{
        id: 'rt-1', slug: 'main-line', name: 'Main Line', mode: 'rail', bidirectional: true,
        geometry: { type: 'LineString', coordinates: [[-119.02, 35.39], [-118.23, 34.05]] }, segments: [],
      }],
    } as never)
    const wrapper = mountView()
    await flushPromises()
    const map = wrapper.find('[data-testid="map"]')
    // The mock MapView reflects its layer counts as data attributes.
    expect(map.attributes('data-stations')).toBe('2')
    expect(map.attributes('data-routes')).toBe('1')
  })

  it('shows the near-miss and realised-interchange reports from the graph', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('[data-testid="near-miss-row"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="realised-cluster-row"]')).toHaveLength(1)
    // Resolved from the owner's services; the unresolvable one falls back to its id.
    expect(wrapper.find('[data-testid="near-miss-row"]').text()).toContain('Midtown Local')
    expect(wrapper.find('[data-testid="near-miss-row"]').text()).toContain('svc1')
  })

  it('shows time between stations for each member service of the compiled graph', async () => {
    vi.mocked(fetchScenarioGraph).mockResolvedValue({
      services: [{
        service_id: 'svc2',
        wait_secs: 0,
        edges: [{ from_slug: 'a', to_slug: 'b', seconds: 125 }],
      }],
      nodes: [
        { slug: 'a', lat: 35.39, lng: -119.02, names: ['Bakersfield'] },
        { slug: 'b', lat: 34.05, lng: -118.23, names: ['Los Angeles'] },
      ],
    } as never)
    const wrapper = mountView()
    await flushPromises()

    const section = wrapper.get('[data-testid="time-between-stations"]')
    expect(section.text()).toContain('Time between stations')
    // The group is named from the owner's service list, not the graph.
    expect(section.get('[data-testid="station-time-group-label"]').text()).toBe('Midtown Local')
    const row = section.get('[data-testid="station-time-row"]')
    expect(row.text()).toContain('Bakersfield')
    expect(row.text()).toContain('Los Angeles')
    expect(row.text()).toContain('2:05')
  })

  it('offers a direction toggle per service group, defaulting to stop order', async () => {
    // The compiler emits each hop with its return leg, which carries the dwell
    // of the stop it arrives at and so has its own run time.
    vi.mocked(fetchScenarioGraph).mockResolvedValue({
      services: [{
        service_id: 'svc2',
        wait_secs: 0,
        edges: [
          { from_slug: 'a', to_slug: 'b', seconds: 125 },
          { from_slug: 'b', to_slug: 'a', seconds: 140 },
        ],
      }],
      nodes: [
        { slug: 'a', lat: 35.39, lng: -119.02, names: ['Bakersfield'] },
        { slug: 'b', lat: 34.05, lng: -118.23, names: ['Los Angeles'] },
      ],
    } as never)
    const wrapper = mountView()
    await flushPromises()

    const toggles = wrapper.findAll('[data-testid="direction-toggle"]')
    expect(toggles.map((t) => t.text())).toEqual(['To Los Angeles', 'To Bakersfield'])
    expect(wrapper.get('[data-testid="station-time-row"]').findAll('td').map((td) => td.text()))
      .toEqual(['Bakersfield', 'Los Angeles', '2:05'])

    await toggles[1].trigger('click')
    expect(wrapper.get('[data-testid="station-time-row"]').findAll('td').map((td) => td.text()))
      .toEqual(['Los Angeles', 'Bakersfield', '2:20'])
  })

  it('shows a run-time skeleton while the graph is still being read', async () => {
    vi.mocked(fetchScenarioGraph).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    await flushPromises()
    // Not yet knowing the run times must not read as "there are none".
    expect(wrapper.get('[data-testid="station-times-loading"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-testid="station-times-empty"]').exists()).toBe(false)
  })

  it('drops the run-time section when the graph never arrives, rather than loading for good', async () => {
    vi.mocked(fetchScenarioGraph).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="time-between-stations"]').exists()).toBe(false)
  })

  it('keeps the map usable when the compiled graph has no run times', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="station-times-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(true)
  })

  it('shows where it sits: the scenario, under My authoring', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(breadcrumbTrail(wrapper)).toEqual([
      ['My authoring', '/authoring'],
      ['CA HSR', null],
    ])
  })

  it('shows a not-found state on a 404 rather than a blank page', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new ApiError('not found', 404))
    const wrapper = mountView('no-such-scenario')
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-not-found"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(false)
  })

  it('shows an error state on a non-404 failure', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-error"]').exists()).toBe(true)
  })

  it('reports a graph read that fails for a reason other than "never compiled"', async () => {
    vi.mocked(fetchScenarioGraph).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(compileScenario).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="graph-error"]').exists()).toBe(true)
  })

  it('keeps the preview when a recompile fails after a graph has loaded', async () => {
    vi.mocked(fetchScenarioIsochrone).mockRejectedValue(new ApiError('stale', 409, 'stale_graph'))
    vi.mocked(compileScenario).mockRejectedValue(new ApiError('compile boom', 500))
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('submit', {
      lat: 37.7, lng: -122.4, duration: 30, mode: 'walk',
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="compile-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(true)
  })

  it('reports a failed compile instead of an unusable form', async () => {
    vi.mocked(fetchScenarioGraph).mockRejectedValue(new ApiError('no compiled graph', 404))
    vi.mocked(compileScenario).mockRejectedValue(new ApiError('compile boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="compile-error"]').exists()).toBe(true)
  })

  it('links to editing the scenario', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[data-testid="edit-scenario"]').attributes('href'))
      .toBe('/authoring/scenarios/ca-hsr/edit')
  })

  it('keeps Delete behind a secondary menu', async () => {
    const wrapper = mountView()
    await flushPromises()
    const menu = wrapper.get('[data-testid="scenario-actions"]')
    expect(menu.element.tagName).toBe('DETAILS')
    expect(menu.get('[data-testid="delete-scenario"]').text()).toBe('Delete network')
  })

  it('asks before deleting, and deletes nothing when declined', async () => {
    const { pending, settle } = useConfirmHost()
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="delete-scenario"]').trigger('click')
    await flushPromises()
    expect(pending.value?.title).toBe("Delete 'CA HSR'?")
    settle(false)
    await flushPromises()
    expect(deleteScenario).not.toHaveBeenCalled()
  })

  it('deletes once confirmed and goes to My authoring', async () => {
    const { settle } = useConfirmHost()
    const wrapper = mountView()
    await wrapper.vm.$router.push('/authoring/scenarios/ca-hsr')
    await flushPromises()
    await wrapper.get('[data-testid="delete-scenario"]').trigger('click')
    await flushPromises()
    settle(true)
    await flushPromises()
    expect(deleteScenario).toHaveBeenCalledWith('ca-hsr')
    expect(wrapper.vm.$router.currentRoute.value.path).toBe('/authoring')
  })
})

describe('AuthoredScenarioView joining near misses into interchanges', () => {
  const union = { service_id: 'svc1', slug: 'union' }
  const midtown = { service_id: 'svc2', slug: 'midtown' }
  const joined: InterchangePair = { a: union, b: midtown }

  const network: Scenario = {
    id: 's1',
    slug: 'ca-hsr',
    name: 'CA HSR',
    description: 'California High-Speed Rail',
    service_ids: ['svc1', 'svc2'],
    boarding_wait: { policy: 'fixed', secs: 300 },
  }

  function line(id: string, name: string, stops: [string, string][]): Service {
    return {
      id, slug: id, route_id: 'r1', name,
      stops: stops.map(([slug, stopName], seq) => ({ slug, name: stopName, seq, lat: 0, lng: 0 })),
      vehicle: { max_speed_kmh: 100, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 },
      frequency_windows: [],
    }
  }

  const lines = [
    line('svc1', 'Coast Express', [['union', 'Union']]),
    line('svc2', 'Midtown Local', [['midtown', 'Midtown'], ['harbour', 'Harbour']]),
  ]

  const unjoinedGraph = {
    services: [{ service_id: 'svc1', edges: [], wait_secs: 300 }, { service_id: 'svc2', edges: [], wait_secs: 300 }],
    merge: {
      near_misses: [{ a: { ...union, name: 'Union' }, b: { ...midtown, name: 'Midtown' }, distance_m: 120.4 }],
    },
  } as TransitGraph

  const joinedGraph = {
    services: unjoinedGraph.services,
    merge: {
      clusters: [{
        key: 'union',
        names: ['Union', 'Midtown'],
        members: [{ ...union, name: 'Union' }, { ...midtown, name: 'Midtown' }],
      }],
    },
  } as TransitGraph

  function stubCompiledGraph(result: TransitGraph) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'job2', kind: 'compile_user_scenario', status: 'succeeded', result }),
    } as Response))
  }

  function lastSavedPairs(): InterchangePair[] {
    return vi.mocked(updateScenario).mock.calls.at(-1)?.[1].interchange_pairs ?? []
  }

  // The compile can only realise the pair if the last save declared it.
  function stubCompileFollowingSaves() {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'job2',
        kind: 'compile_user_scenario',
        status: 'succeeded',
        result: lastSavedPairs().some((pair) => sameInterchangePair(pair, joined)) ? joinedGraph : unjoinedGraph,
      }),
    } as Response)))
  }

  // The API's own member check: a pair naming a line outside the network is
  // refused, the whole save with it.
  async function apiUpdate(slug: string, input: ScenarioInput): Promise<Scenario> {
    const outsider = input.interchange_pairs.findIndex((pair) =>
      !input.service_ids.includes(pair.a.service_id) || !input.service_ids.includes(pair.b.service_id))
    if (outsider >= 0) {
      throw new ApiError('PUT failed: 422', 422, 'validation', {
        faults: [{ field: 'interchange_pairs', index: outsider, rule: 'not_member' }],
      })
    }
    return { ...network, ...input, slug }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchScenario).mockReset().mockResolvedValue(network)
    vi.mocked(fetchScenarioGraph).mockReset().mockResolvedValue(unjoinedGraph)
    vi.mocked(fetchMyServices).mockReset().mockResolvedValue(lines)
    vi.mocked(compileScenario).mockReset().mockResolvedValue({ id: 'job2', kind: 'compile_user_scenario', status: 'queued' })
    vi.mocked(updateScenario).mockReset().mockImplementation(apiUpdate)
    stubCompileFollowingSaves()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('joins a near miss with one click: saves the pair, recompiles, and lists it as realised', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('[data-testid="near-miss-row"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="realised-cluster-row"]').exists()).toBe(false)

    await wrapper.get('[data-testid="join-interchange"]').trigger('click')
    await flushPromises()

    // Everything else the scenario carried goes back as it came.
    expect(updateScenario).toHaveBeenCalledWith('ca-hsr', {
      name: 'CA HSR',
      description: 'California High-Speed Rail',
      service_ids: ['svc1', 'svc2'],
      interchange_pairs: [joined],
      boarding_wait: { policy: 'fixed', secs: 300 },
    })
    expect(compileScenario).toHaveBeenCalledWith('ca-hsr', expect.any(Object))
    expect(vi.mocked(updateScenario).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(compileScenario).mock.invocationCallOrder[0])
    expect(wrapper.find('[data-testid="near-miss-row"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="realised-cluster-row"]').text()).toBe('Union, Midtown')
    expect(wrapper.get('[data-testid="declared-interchange-row"]').text())
      .toContain('Union (Coast Express) and Midtown (Midtown Local)')
  })

  it('says it is recompiling for the interchange, and holds every button until it has', async () => {
    vi.mocked(compileScenario).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="join-interchange"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="recompiling-status"]').text()).toBe('Interchanges changed — recompiling…')
    expect(wrapper.find('[data-testid="join-interchange"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="recompile-interchange"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="remove-interchange"]').attributes('disabled')).toBeDefined()
  })

  it('says it is saving, and holds the button while the save is in flight, so a second click cannot declare the pair twice', async () => {
    vi.mocked(updateScenario).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="join-interchange"]').trigger('click')
    await wrapper.get('[data-testid="join-interchange"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="recompiling-status"]').text()).toBe('Saving interchanges…')
    expect(wrapper.get('[data-testid="join-interchange"]').attributes('disabled')).toBeDefined()
    expect(updateScenario).toHaveBeenCalledTimes(1)
  })

  it('offers Recompile, not Join, for a near miss already declared in either order', async () => {
    vi.mocked(fetchScenario).mockResolvedValue({ ...network, interchange_pairs: [{ a: midtown, b: union }] })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="join-interchange"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="near-miss-declared"]').text()).toBe('Declared — not in the compiled network yet')
    expect(wrapper.text()).not.toContain('Joined')

    await wrapper.get('[data-testid="recompile-interchange"]').trigger('click')
    await flushPromises()

    expect(updateScenario).not.toHaveBeenCalled()
    expect(compileScenario).toHaveBeenCalledWith('ca-hsr', expect.any(Object))
  })

  it('does not say Joined when the join saved but its recompile failed over an older graph: it says so beside the interchanges and offers Recompile', async () => {
    vi.mocked(compileScenario).mockRejectedValueOnce(new ApiError('compile boom', 500))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="join-interchange"]').trigger('click')
    await flushPromises()

    expect(updateScenario).toHaveBeenCalledWith('ca-hsr', expect.objectContaining({ interchange_pairs: [joined] }))
    const alert = wrapper.get('[data-testid="interchange-compile-error"]')
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('The preview is from the last compile that worked.')
    expect(wrapper.text()).not.toContain('Joined')
    expect(wrapper.get('[data-testid="near-miss-declared"]').text()).toBe('Declared — not in the compiled network yet')
    const recompile = wrapper.get('[data-testid="recompile-interchange"]')
    expect(recompile.attributes('disabled')).toBeUndefined()

    await recompile.trigger('click')
    await flushPromises()

    expect(updateScenario).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="interchange-compile-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="near-miss-row"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="realised-cluster-row"]').text()).toBe('Union, Midtown')
  })

  // The page's copy predates any edit made since in another tab; writing it
  // back whole would revert that edit.
  it('applies the join to the scenario as it is now, not as the page loaded it', async () => {
    const editedElsewhere: Scenario = {
      ...network,
      name: 'CA HSR Phase 2',
      service_ids: ['svc1', 'svc2', 'svc3'],
      boarding_wait: { policy: 'none' },
    }
    vi.mocked(fetchScenario).mockResolvedValueOnce(network).mockResolvedValue(editedElsewhere)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="join-interchange"]').trigger('click')
    await flushPromises()

    expect(updateScenario).toHaveBeenCalledWith('ca-hsr', {
      name: 'CA HSR Phase 2',
      description: 'California High-Speed Rail',
      service_ids: ['svc1', 'svc2', 'svc3'],
      interchange_pairs: [joined],
      boarding_wait: { policy: 'none' },
    })
    expect(wrapper.get('h1').text()).toBe('CA HSR Phase 2')
  })

  // Deleting a line drops its membership but leaves its pairs, which the API
  // then refuses on every save (not_member) — so they could never be removed.
  it('drops pairs naming a line no longer in the network, so Remove still saves', async () => {
    const pier = { service_id: 'svc9', slug: 'pier' }
    const pierUnion: InterchangePair = { a: pier, b: union }
    const pierHarbour: InterchangePair = { a: pier, b: { service_id: 'svc2', slug: 'harbour' } }
    vi.mocked(fetchScenario).mockResolvedValue({ ...network, interchange_pairs: [pierUnion, pierHarbour, joined] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('[data-testid="declared-interchange-row"]')).toHaveLength(3)

    await wrapper.findAll('[data-testid="remove-interchange"]')[0].trigger('click')
    await flushPromises()

    expect(updateScenario).toHaveBeenCalledWith('ca-hsr', expect.objectContaining({ interchange_pairs: [joined] }))
    await expect(vi.mocked(updateScenario).mock.results[0].value).resolves.toBeDefined()
    expect(wrapper.find('[data-testid="interchange-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="declared-interchange-row"]')).toHaveLength(1)
  })

  it.each([
    ['a stop renamed since the graph compiled', { service_ids: ['svc1', 'svc2'] }, [
      line('svc1', 'Coast Express', [['union', 'Union']]),
      line('svc2', 'Midtown Local', [['midtown-central', 'Midtown Central']]),
    ]],
    ['a line taken out of the network since the graph compiled', { service_ids: ['svc1'] }, lines],
  ])('will not join a near miss naming %s', async (_case, edit, current) => {
    vi.mocked(fetchScenario).mockResolvedValue({ ...network, ...edit })
    vi.mocked(fetchMyServices).mockResolvedValue(current)
    const wrapper = mountView()
    await flushPromises()

    const button = wrapper.get('[data-testid="join-interchange"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toBe('Stop no longer in this network')
    expect(wrapper.get('[data-testid="near-miss-gone"]').text()).toBe('A stop is no longer in this network')
  })

  it('names the pair on each button', async () => {
    vi.mocked(fetchScenario).mockResolvedValue({
      ...network,
      interchange_pairs: [{ a: union, b: { service_id: 'svc2', slug: 'harbour' } }],
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="join-interchange"]').attributes('aria-label'))
      .toBe('Join Union and Midtown as an interchange')
    expect(wrapper.get('[data-testid="remove-interchange"]').attributes('aria-label'))
      .toBe('Remove interchange Union (Coast Express) and Harbour (Midtown Local)')
  })

  const unionHarbour: InterchangePair = { a: union, b: { service_id: 'svc2', slug: 'harbour' } }

  it.each([
    ['a join, to the declared list', 'join-interchange', [unionHarbour], 'declared-interchanges-heading'],
    ['a removal, to the declared list', 'remove-interchange', [unionHarbour, joined], 'declared-interchanges-heading'],
    ['the last removal, to the page heading', 'remove-interchange', [unionHarbour], null],
  ])('moves focus once %s, not to the page body', async (_case, button, pairs, target) => {
    vi.mocked(fetchScenario).mockResolvedValue({ ...network, interchange_pairs: pairs })
    const wrapper = mount(AuthoredScenarioView, {
      props: { slug: 'ca-hsr' },
      attachTo: document.body,
      global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)', component: Stub }] })] },
    })
    await flushPromises()

    const clicked = wrapper.get(`[data-testid="${button}"]`)
    ;(clicked.element as HTMLButtonElement).focus()
    await clicked.trigger('click')
    await flushPromises()

    expect(document.activeElement).toBe(target ? wrapper.get(`[data-testid="${target}"]`).element : wrapper.get('h1').element)
    wrapper.unmount()
  })

  it('says why the save was refused, does not recompile, and keeps the near miss', async () => {
    vi.mocked(updateScenario).mockRejectedValue(new ApiError('PUT failed: 422', 422, 'validation', {
      faults: [{ field: 'interchange_pairs', index: 0, rule: 'same_service' }],
    }))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="join-interchange"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="interchange-error"]').text()).toBe('Interchange 1 joins a line to itself.')
    expect(compileScenario).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="near-miss-row"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="join-interchange"]').attributes('disabled')).toBeUndefined()
  })

  it('removes a declared pair, saving the others, and recompiles', async () => {
    const other: InterchangePair = { a: { service_id: 'svc1', slug: 'union' }, b: { service_id: 'svc2', slug: 'harbour' } }
    vi.mocked(fetchScenario).mockResolvedValue({ ...network, interchange_pairs: [joined, other] })
    stubCompiledGraph(unjoinedGraph)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('[data-testid="declared-interchange-row"]')).toHaveLength(2)

    await wrapper.findAll('[data-testid="remove-interchange"]')[0].trigger('click')
    await flushPromises()

    expect(updateScenario).toHaveBeenCalledWith('ca-hsr', expect.objectContaining({ interchange_pairs: [other] }))
    expect(compileScenario).toHaveBeenCalledWith('ca-hsr', expect.any(Object))
    expect(wrapper.findAll('[data-testid="declared-interchange-row"]').map((row) => row.text()))
      .toEqual([expect.stringContaining('Union (Coast Express) and Harbour (Midtown Local)')])
  })

  // A pair naming a stop that has gone fails every compile, so it has to stay
  // reachable even with no graph to preview.
  it('lists a pair whose stop has gone, even when the compile it breaks leaves no preview, and removes it', async () => {
    const stale: InterchangePair = { a: union, b: { service_id: 'svc2', slug: 'old-midtown' } }
    vi.mocked(fetchScenario).mockResolvedValue({ ...network, interchange_pairs: [stale] })
    vi.mocked(fetchScenarioGraph).mockRejectedValue(new ApiError('no compiled graph', 404))
    stubCompiledGraph(unjoinedGraph)
    vi.mocked(compileScenario).mockRejectedValueOnce(new ApiError('compile boom', 500))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="compile-error"]').exists()).toBe(true)
    const row = wrapper.get('[data-testid="declared-interchange-row"]')
    expect(row.text()).toContain('Union (Coast Express) and old-midtown (Midtown Local)')
    expect(row.find('[data-testid="declared-interchange-missing"]').exists()).toBe(true)

    await row.get('[data-testid="remove-interchange"]').trigger('click')
    await flushPromises()

    expect(updateScenario).toHaveBeenCalledWith('ca-hsr', expect.objectContaining({ interchange_pairs: [] }))
    expect(wrapper.find('[data-testid="compile-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="map"]').exists()).toBe(true)
  })

  it('names a pair on a line it has no record of by its ids, and marks it gone', async () => {
    const orphan: InterchangePair = { a: union, b: { service_id: 'svc9', slug: 'pier' } }
    vi.mocked(fetchScenario).mockResolvedValue({ ...network, interchange_pairs: [orphan] })
    const wrapper = mountView()
    await flushPromises()

    const row = wrapper.get('[data-testid="declared-interchange-row"]')
    expect(row.text()).toContain('Union (Coast Express) and pier (svc9)')
    expect(row.find('[data-testid="declared-interchange-missing"]').exists()).toBe(true)
  })
})
