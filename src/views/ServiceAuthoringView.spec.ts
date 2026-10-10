import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type DOMWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Job, Route, RouteSummary, SnapStopsResponse, Service, TransitGraph } from '../api/authoring/types'

vi.mock('../api/authoring/routes', () => ({
  listRoutes: vi.fn(),
  fetchMyRoutes: vi.fn(),
  fetchRoute: vi.fn(),
  snapStops: vi.fn(),
}))
vi.mock('../api/authoring/services', () => ({
  createService: vi.fn(),
  updateService: vi.fn(),
  fetchService: vi.fn(),
  fetchServiceGraph: vi.fn(),
  compileService: vi.fn(),
}))

import ServiceAuthoringView from './ServiceAuthoringView.vue'
import { seriousA11yViolations } from '../test/axe'
import { breadcrumbTrail } from '../test/breadcrumbs'
import { busyRegion, visibleText } from '../test/loading'
import { listRoutes, fetchMyRoutes, fetchRoute, snapStops } from '../api/authoring/routes'
import {
  createService,
  compileService,
  fetchService,
  fetchServiceGraph,
  updateService,
} from '../api/authoring/services'
import { ApiError } from '../api/authoring/client'
import { useDraftsStore } from '../stores/drafts'
import { mountSharedHosts } from '../test/sharedHosts'

const stubRouteSummary: RouteSummary = { slug: 'main-line', name: 'Main Line', mode: 'rail' }

const stubRoute: Route = {
  id: 'rt1',
  slug: 'main-line',
  name: 'Main Line',
  mode: 'rail',
  bidirectional: true,
  geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
  segments: [],
}

function snapResponse(overrides: Partial<SnapStopsResponse> = {}): SnapStopsResponse {
  return {
    route_slug: 'main-line',
    off_route_threshold_m: 500,
    stops: [
      { input: { lat: 37.77, lng: -122.41 }, snapped: { lat: 37.77, lng: -122.41 }, chainage_m: 0, offset_m: 0, off_route: false },
      { input: { lat: 37.33, lng: -121.88 }, snapped: { lat: 37.33, lng: -121.88 }, chainage_m: 1000, offset_m: 0, off_route: false },
    ],
    chainage_order: [0, 1],
    order_is_consistent: true,
    ...overrides,
  }
}

const stubService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'rt1',
  name: 'Northbound Express',
  stops: [],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 },
  frequency_windows: [],
}

function mountView(attachTo?: HTMLElement) {
  return mount(ServiceAuthoringView, {
    global: { stubs: { MapView: true } },
    attachTo,
  })
}

// The typed fields sit inside the "Add by coordinates" disclosure, so an
// author opens it before using them.
async function addStop(wrapper: ReturnType<typeof mountView>, name: string, lat: number, lng: number) {
  ;(wrapper.get('[data-testid="add-by-coordinates"]').element as HTMLDetailsElement).open = true
  await wrapper.find('[data-testid="stop-name"]').setValue(name)
  await wrapper.find('[data-testid="stop-lat"]').setValue(lat)
  await wrapper.find('[data-testid="stop-lng"]').setValue(lng)
  await wrapper.find('[data-testid="add-stop"]').trigger('click')
}

function saveStatus(wrapper: ReturnType<typeof mountView>): string {
  return wrapper.get('[data-testid="save-bar"] [data-testid="save-status"]').text()
}

function formLocked(wrapper: ReturnType<typeof mountView>): boolean {
  return (wrapper.get('[data-testid="form-body"]').element as HTMLFieldSetElement).disabled
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function stopRowName(row: DOMWrapper<Element>): string {
  return (row.find('input[type="text"]').element as HTMLInputElement).value
}

function mapStub(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findComponent({ name: 'MapView' })
}

type StopAction = 'up' | 'down' | 'edit-position' | 'show' | 'remove'

// Every per-stop action sits behind the row's menu, so reaching one takes two
// clicks: the menu, then the item.
async function chooseStopAction(wrapper: ReturnType<typeof mountView>, index: number, action: StopAction) {
  await wrapper.get(`[data-testid="stop-actions-${index}"]`).trigger('click')
  await flushPromises()
  await wrapper.get(`[data-testid="stop-${action}-${index}"]`).trigger('click')
  await flushPromises()
}

function stopNamesIn(wrapper: ReturnType<typeof mountView>): string[] {
  return wrapper.findAll('[data-testid="stop-row"]').map(stopRowName)
}

async function mountWithTwoStops(attachTo?: HTMLElement) {
  const wrapper = mountView(attachTo)
  await flushPromises()
  await wrapper.find('[data-testid="route-select"]').setValue('main-line')
  await flushPromises()
  await addStop(wrapper, 'SF', 37.77, -122.41)
  await addStop(wrapper, 'SJ', 37.33, -121.88)
  await vi.advanceTimersByTimeAsync(400)
  await flushPromises()
  vi.mocked(snapStops).mockClear()
  return wrapper
}

describe('ServiceAuthoringView', () => {
  let hosts: ReturnType<typeof mountSharedHosts>

  beforeEach(() => {
    hosts = mountSharedHosts()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.mocked(listRoutes).mockResolvedValue([stubRouteSummary])
    vi.mocked(fetchMyRoutes).mockResolvedValue([])
    vi.mocked(fetchRoute).mockResolvedValue(stubRoute)
    vi.mocked(snapStops).mockResolvedValue(snapResponse())
    vi.mocked(createService).mockResolvedValue(stubService)
    vi.mocked(compileService).mockResolvedValue({ id: 'job1', kind: 'compile_user_service', status: 'queued' } as Job)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    hosts.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('has no serious or critical accessibility violations with two stops placed', async () => {
    const wrapper = await mountWithTwoStops(document.body)
    vi.useRealTimers()
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })

  it('loads the route list and offers it in the picker', async () => {
    const wrapper = mountView()
    await flushPromises()
    const options = wrapper.findAll('[data-testid="route-select"] option')
    expect(options.some((o) => o.text().includes('Main Line'))).toBe(true)
  })

  it('groups the author\'s own routes above the curated ones', async () => {
    vi.mocked(fetchMyRoutes).mockResolvedValue([{ id: 'rt9', slug: 'my-spur', name: 'My Spur', mode: 'tram', length_m: 1200 }])
    const wrapper = mountView()
    await flushPromises()
    const groups = wrapper.findAll('[data-testid="route-select"] optgroup')
    expect(groups.map((g) => g.attributes('label'))).toEqual(['Your routes', 'Curated routes'])
    expect(groups[0].findAll('option').map((o) => o.text())).toEqual(['My Spur (tram)'])
    expect(groups[1].findAll('option').map((o) => o.text())).toEqual(['Main Line (rail)'])
  })

  it('leaves out the group an author has nothing in', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="route-group-owned"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="route-group-curated"]').exists()).toBe(true)
  })

  it('keeps the curated routes, with no error, when the author\'s own fail to load', async () => {
    vi.mocked(fetchMyRoutes).mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="routes-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="route-select"] option').some((o) => o.text().includes('Main Line'))).toBe(true)
  })

  it('offers to draw a new route, returning here afterwards', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/authoring/services/new', name: 'new-service', component: ServiceAuthoringView },
        { path: '/authoring/routes/new', name: 'new-route', component: { template: '<div>stub</div>' } },
      ],
    })
    await router.push('/authoring/services/new')
    const wrapper = mount(ServiceAuthoringView, { global: { plugins: [router], stubs: { MapView: true } } })
    await flushPromises()
    const link = wrapper.get('[data-testid="draw-route-link"]')
    expect(link.text()).toBe('Draw a new route…')
    expect(link.attributes('href')).toBe('/authoring/routes/new?return=/authoring/services/new')
  })

  it('shows a route-picker skeleton, not loading copy, while the routes load', async () => {
    vi.mocked(listRoutes).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    await flushPromises()
    const region = busyRegion(wrapper, 'routes-loading')
    expect(region.find('[data-testid="field-skeleton"]').exists()).toBe(true)
    expect(visibleText(region)).toBe('')
  })

  it('shows an error state when both route lists fail to load', async () => {
    vi.mocked(listRoutes).mockRejectedValue(new Error('boom'))
    vi.mocked(fetchMyRoutes).mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="routes-error"]').exists()).toBe(true)
  })

  it('fetches the chosen route and schedules a snap preview once stops exist', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="route-select"]').setValue('main-line')
    await flushPromises()
    expect(fetchRoute).toHaveBeenCalledWith('main-line')

    await addStop(wrapper, 'SF', 37.77, -122.41)
    expect(snapStops).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(400)
    expect(snapStops).toHaveBeenCalledWith('main-line', [{ lat: 37.77, lng: -122.41 }])
  })

  it('renders an added stop in the stop list', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="route-select"]').setValue('main-line')
    await flushPromises()

    await addStop(wrapper, 'SF', 37.77, -122.41)
    const rows = wrapper.findAll('[data-testid="stop-row"]')
    expect(rows).toHaveLength(1)
    expect(stopRowName(rows[0])).toBe('SF')
  })

  it('shows an off-route warning inline once the preview flags a stop', async () => {
    vi.mocked(snapStops).mockResolvedValue(
      snapResponse({
        stops: [
          { input: { lat: 40, lng: -70 }, snapped: { lat: 37.77, lng: -122.41 }, chainage_m: 0, offset_m: 620, off_route: true },
          { input: { lat: 37.33, lng: -121.88 }, snapped: { lat: 37.33, lng: -121.88 }, chainage_m: 1000, offset_m: 0, off_route: false },
        ],
      }),
    )
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="route-select"]').setValue('main-line')
    await flushPromises()

    await addStop(wrapper, 'Faraway', 40, -70)
    await addStop(wrapper, 'SJ', 37.33, -121.88)
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()

    expect(wrapper.find('[data-testid="stop-off-route"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="stop-off-route"]').text()).toContain('620')
  })

  it('shows an order warning when the preview reports an inconsistent order', async () => {
    vi.mocked(snapStops).mockResolvedValue(snapResponse({ order_is_consistent: false, chainage_order: [1, 0] }))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="route-select"]').setValue('main-line')
    await flushPromises()

    await addStop(wrapper, 'A', 37.77, -122.41)
    await addStop(wrapper, 'B', 37.33, -121.88)
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()

    expect(wrapper.find('[data-testid="order-warning"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="order-warning"]').text()).toContain('B → A')
  })

  it('reorders stops from the move items in each stop\'s menu', async () => {
    const wrapper = mountView()
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)
    await addStop(wrapper, 'B', 2, 2)

    await chooseStopAction(wrapper, 0, 'down')
    const rows = wrapper.findAll('[data-testid="stop-row"]')
    expect(stopRowName(rows[0])).toBe('B')
    expect(stopRowName(rows[1])).toBe('A')
  })

  // Vue writes :value back on patch, so uncommitted characters do not survive
  // the reorder by themselves. Restoring them on that same node, then firing
  // change, checks the commit hits the stop the node is keyed to. The
  // node-identity assertion is what locks :key="stop.id".
  it('keeps a half-typed stop name on the stop that was typed into when another row is reordered', async () => {
    // Attached so a node still in the document reports isConnected.
    const wrapper = mount(ServiceAuthoringView, {
      attachTo: document.body,
      global: { stubs: { MapView: true } },
    })
    try {
      await flushPromises()
      await addStop(wrapper, 'Alpha', 1, 1)
      await addStop(wrapper, 'Bravo', 2, 2)
      await addStop(wrapper, 'Charlie', 3, 3)

      const nameInput = wrapper.get('[data-testid="stop-edit-name-2"]').element as HTMLInputElement
      nameInput.value = 'Charlie West'

      await chooseStopAction(wrapper, 1, 'down')

      const charlieAt = useDraftsStore().serviceDraft!.stops.findIndex((stop) => stop.lat === 3)
      const charlieRow = wrapper.findAll('[data-testid="stop-row"]')[charlieAt]
      expect(charlieAt).toBe(1)
      expect(charlieRow.element.contains(nameInput)).toBe(true)
      expect(nameInput.isConnected).toBe(true)

      nameInput.value = 'Charlie West'
      nameInput.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()

      const stops = useDraftsStore().serviceDraft!.stops
      const charlie = stops.find((stop) => stop.lat === 3 && stop.lng === 3)
      expect(charlie?.name).toBe('Charlie West')
      expect(stops.map((stop) => stop.name)).toEqual(['Alpha', 'Charlie West', 'Bravo'])
    } finally {
      wrapper.unmount()
    }
  })

  it('removes a stop once confirmed, and says so', async () => {
    const wrapper = mountView()
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)
    await addStop(wrapper, 'B', 2, 2)

    await chooseStopAction(wrapper, 0, 'remove')
    expect(wrapper.findAll('[data-testid="stop-row"]')).toHaveLength(2)
    expect(hosts.dialogOpen()).toBe(true)
    expect(hosts.dialog().text()).toContain('A')

    await hosts.confirmButton().trigger('click')
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="stop-row"]')
    expect(rows).toHaveLength(1)
    expect(stopRowName(rows[0])).toBe('B')
    expect(hosts.toasts()).toEqual(['Stop removed'])
  })

  it.each([
    ['the stop that took its place', 0, 'stop-actions-0'],
    ['the stop before it, when it was last', 1, 'stop-actions-0'],
  ])('moves focus to the menu of %s once a stop is removed', async (_, removed, focused) => {
    const wrapper = mount(ServiceAuthoringView, { global: { stubs: { MapView: true } }, attachTo: document.body })
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)
    await addStop(wrapper, 'B', 2, 2)

    await chooseStopAction(wrapper, removed, 'remove')
    await hosts.confirmButton().trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get(`[data-testid="${focused}"]`).element)
    wrapper.unmount()
  })

  it('moves focus to the way to place a stop once the last stop is removed', async () => {
    const wrapper = mount(ServiceAuthoringView, { global: { stubs: { MapView: true } }, attachTo: document.body })
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)

    await chooseStopAction(wrapper, 0, 'remove')
    await hosts.confirmButton().trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="toggle-place-stops"]').element)
    wrapper.unmount()
  })

  it('returns focus to the stop\'s menu when removing it is backed out of', async () => {
    const wrapper = mount(ServiceAuthoringView, { global: { stubs: { MapView: true } }, attachTo: document.body })
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)

    await chooseStopAction(wrapper, 0, 'remove')
    await hosts.cancelButton().trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-actions-0"]').element)
    wrapper.unmount()
  })

  it('keeps a stop when removing it is backed out of', async () => {
    const wrapper = mountView()
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)

    await chooseStopAction(wrapper, 0, 'remove')
    await hosts.cancelButton().trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="stop-row"]')).toHaveLength(1)
    expect(hosts.toasts()).toEqual([])
  })

  it('edits a stop\'s position once Edit position has revealed it', async () => {
    const wrapper = mountView()
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)

    await chooseStopAction(wrapper, 0, 'edit-position')
    const latInput = wrapper.find('[data-testid="stop-edit-lat-0"]')
    await latInput.setValue(40)
    await latInput.trigger('change')

    expect(useDraftsStore().serviceDraft?.stops[0].lat).toBe(40)
  })

  describe('the stop list', () => {
    function threeStopSnap(order: number[], consistent: boolean): SnapStopsResponse {
      return snapResponse({
        stops: [1, 2, 3].map((n) => ({
          input: { lat: n, lng: n },
          snapped: { lat: n, lng: n },
          chainage_m: n * 1000,
          offset_m: 0,
          off_route: false,
        })),
        chainage_order: order,
        order_is_consistent: consistent,
      })
    }

    async function mountWithStops(names: string[], { attach = false } = {}) {
      const wrapper = mount(ServiceAuthoringView, {
        global: { stubs: { MapView: true } },
        ...(attach ? { attachTo: document.body } : {}),
      })
      await flushPromises()
      await wrapper.find('[data-testid="route-select"]').setValue('main-line')
      await flushPromises()
      for (const [i, stopName] of names.entries()) await addStop(wrapper, stopName, i + 1, i + 1)
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      return wrapper
    }

    function rowElements(wrapper: ReturnType<typeof mountView>): Element[] {
      return wrapper.findAll('[data-testid="stop-row"]').map((row) => row.element)
    }

    // Enough of the accessible-name computation for the controls these rows
    // hold: an aria-label wins, then the wrapping label, then the text.
    function accessibleName(element: Element): string {
      const named = element.getAttribute('aria-label') ?? element.closest('label')?.textContent ?? element.textContent
      return (named ?? '').replace(/\s+/g, ' ').trim()
    }

    it('says how to place the first stop while there are none', async () => {
      const wrapper = mountView()
      await flushPromises()

      const empty = wrapper.get('[data-testid="stops-empty"]')
      const toggle = wrapper.get('[data-testid="toggle-place-stops"]')
      expect(empty.text()).toContain(`"${toggle.text()}"`)
      expect(wrapper.find('[data-testid="stops-list"]').exists()).toBe(false)
    })

    it('shows no latitude or longitude input until a stop\'s position is asked for', async () => {
      const wrapper = mountView()
      await flushPromises()
      mapStub(wrapper).vm.$emit('map-click', { lat: 1, lng: 1 })
      mapStub(wrapper).vm.$emit('map-click', { lat: 2, lng: 2 })
      await flushPromises()

      expect(wrapper.find('[data-testid="stops-empty"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="stop-row"]')).toHaveLength(2)
      expect(wrapper.findAll('[data-testid="stops-list"] input[type="number"]')).toHaveLength(0)
      // The typed fallback is the only other place coordinates are asked for,
      // and it stays folded away inside its disclosure.
      const fallback = wrapper.get('[data-testid="add-by-coordinates"]')
      expect((fallback.element as HTMLDetailsElement).open).toBe(false)
      expect(fallback.get('summary').text()).toBe('Add by coordinates')
      const stopsSection = fallback.element.closest('section')!
      const coordinateInputs = Array.from(stopsSection.querySelectorAll('input[type="number"]'))
      expect(coordinateInputs).toHaveLength(2)
      expect(coordinateInputs.every((input) => fallback.element.contains(input))).toBe(true)
    })

    it('reveals the latitude and longitude of one stop from Edit position, and folds them away again', async () => {
      const wrapper = await mountWithStops(['A', 'B'], { attach: true })

      await chooseStopAction(wrapper, 1, 'edit-position')

      expect(wrapper.findAll('[data-testid="stops-list"] input[type="number"]')).toHaveLength(2)
      expect(wrapper.find('[data-testid="stop-edit-lat-0"]').exists()).toBe(false)
      const lat = wrapper.get('[data-testid="stop-edit-lat-1"]')
      expect(Number((lat.element as HTMLInputElement).value)).toBe(2)
      expect(accessibleName(lat.element)).toBe('Latitude of B')
      expect(accessibleName(wrapper.get('[data-testid="stop-edit-lng-1"]').element)).toBe('Longitude of B')
      expect(document.activeElement).toBe(lat.element)

      await wrapper.get('[data-testid="stop-position-done-1"]').trigger('click')

      expect(wrapper.findAll('[data-testid="stops-list"] input[type="number"]')).toHaveLength(0)
      expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-actions-1"]').element)
      wrapper.unmount()
    })

    it('ignores a cleared coordinate rather than moving the stop to zero', async () => {
      const wrapper = await mountWithStops(['A'])
      await chooseStopAction(wrapper, 0, 'edit-position')

      const lat = wrapper.get('[data-testid="stop-edit-lat-0"]')
      await lat.setValue('')

      expect(useDraftsStore().serviceDraft!.stops[0].lat).toBe(1)
      expect((lat.element as HTMLInputElement).value).toBe('1')
    })

    it.each([
      ['lat', 90.5],
      ['lat', -200],
      ['lng', 180.1],
    ] as const)('ignores a %s of %s, which no point on Earth has', async (field, value) => {
      const wrapper = await mountWithStops(['A'])
      await chooseStopAction(wrapper, 0, 'edit-position')

      const input = wrapper.get(`[data-testid="stop-edit-${field}-0"]`)
      await input.setValue(value)

      expect(useDraftsStore().serviceDraft!.stops[0][field]).toBe(1)
      expect((input.element as HTMLInputElement).value).toBe('1')
    })

    it('accepts a coordinate at the very edge of the range', async () => {
      const wrapper = await mountWithStops(['A'])
      await chooseStopAction(wrapper, 0, 'edit-position')

      await wrapper.get('[data-testid="stop-edit-lng-0"]').setValue(-180)

      expect(useDraftsStore().serviceDraft!.stops[0].lng).toBe(-180)
    })

    it.each([
      ['an empty latitude', '', 2],
      ['a latitude past the pole', 91, 2],
      ['a longitude past the antimeridian', 2, -181],
    ])('adds no stop by coordinates with %s', async (_, lat, lng) => {
      const wrapper = await mountWithStops(['A'])

      ;(wrapper.get('[data-testid="add-by-coordinates"]').element as HTMLDetailsElement).open = true
      await wrapper.get('[data-testid="stop-name"]').setValue('B')
      await wrapper.get('[data-testid="stop-lat"]').setValue(lat)
      await wrapper.get('[data-testid="stop-lng"]').setValue(lng)
      await wrapper.get('[data-testid="add-stop"]').trigger('click')

      expect(stopNamesIn(wrapper)).toEqual(['A'])
    })

    it('labels the typed coordinates the way the row editor does', async () => {
      const wrapper = await mountWithStops(['A'])
      await chooseStopAction(wrapper, 0, 'edit-position')

      const fallbackLabels = ['stop-lat', 'stop-lng'].map((id) => accessibleName(wrapper.get(`[data-testid="${id}"]`).element))
      expect(fallbackLabels).toEqual(['Latitude', 'Longitude'])
      expect(accessibleName(wrapper.get('[data-testid="stop-edit-lat-0"]').element)).toBe('Latitude of A')
    })

    it('puts the stops in route order in one click, keeping each row, and the warning clears once the preview agrees', async () => {
      vi.mocked(snapStops)
        .mockResolvedValueOnce(threeStopSnap([2, 0, 1], false))
        .mockResolvedValue(threeStopSnap([0, 1, 2], true))
      const wrapper = await mountWithStops(['A', 'B', 'C'], { attach: true })
      const [a, b, c] = rowElements(wrapper)
      const warning = wrapper.get('[data-testid="order-warning"]')
      expect(warning.text()).toContain('C → A → B')
      const button = wrapper.get('[data-testid="put-in-route-order"]')
      expect(button.attributes('aria-disabled')).toBeUndefined()
      expect(button.attributes('aria-describedby')).toBe(warning.attributes('id'))
      ;(button.element as HTMLElement).focus()

      await button.trigger('click')

      expect(stopNamesIn(wrapper)).toEqual(['C', 'A', 'B'])
      expect(rowElements(wrapper)).toEqual([c, a, b])
      expect(wrapper.get('[data-testid="stop-announcement"]').text()).toBe('Stops put in route order')
      // Unavailable now until the preview catches up, but still where focus is.
      expect(button.attributes('aria-disabled')).toBe('true')
      expect(button.attributes('disabled')).toBeUndefined()
      expect(document.activeElement).toBe(button.element)

      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(snapStops).toHaveBeenLastCalledWith('main-line', [
        { lat: 3, lng: 3 },
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ])
      expect(wrapper.find('[data-testid="order-warning"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="put-in-route-order"]').attributes('aria-disabled')).toBe('true')
      wrapper.unmount()
    })

    it('offers no route order while the stops are already in it, and says when it will', async () => {
      vi.mocked(snapStops).mockResolvedValue(threeStopSnap([0, 1, 2], true))
      const wrapper = await mountWithStops(['A', 'B', 'C'])
      const button = wrapper.get('[data-testid="put-in-route-order"]')

      expect(button.attributes('aria-disabled')).toBe('true')
      const hint = wrapper.get(`#${button.attributes('aria-describedby')}`)
      expect(hint.text()).toBe('Available when the check against the route finds the stops out of order.')

      await button.trigger('click')

      expect(stopNamesIn(wrapper)).toEqual(['A', 'B', 'C'])
      expect(wrapper.get('[data-testid="stop-announcement"]').text()).toBe('')
    })

    // The route order was worked out for where the stops were. One moved since
    // may fall somewhere else along the line, so the order waits for the
    // preview that has seen it.
    it('offers no route order once a stop has moved since the preview', async () => {
      vi.mocked(snapStops).mockResolvedValue(threeStopSnap([2, 0, 1], false))
      const wrapper = await mountWithStops(['A', 'B', 'C'])
      const button = wrapper.get('[data-testid="put-in-route-order"]')
      expect(button.attributes('aria-disabled')).toBeUndefined()

      await chooseStopAction(wrapper, 0, 'edit-position')
      await wrapper.get('[data-testid="stop-edit-lat-0"]').setValue(5)

      expect(button.attributes('aria-disabled')).toBe('true')
      const described = button.attributes('aria-describedby')!.split(' ').map((id) => wrapper.get(`#${id}`).text())
      expect(described).toEqual([
        expect.stringContaining('C → A → B'),
        'Available again once the check against the route has caught up with your changes.',
      ])
      await button.trigger('click')
      expect(stopNamesIn(wrapper)).toEqual(['A', 'B', 'C'])

      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      expect(button.attributes('aria-disabled')).toBeUndefined()
    })

    it('reverses the order of the stops, keeping each row', async () => {
      const wrapper = await mountWithStops(['A', 'B', 'C'])
      const [a, b, c] = rowElements(wrapper)

      await wrapper.get('[data-testid="reverse-stops"]').trigger('click')

      expect(stopNamesIn(wrapper)).toEqual(['C', 'B', 'A'])
      expect(rowElements(wrapper)).toEqual([c, b, a])
    })

    it('moves a stop from the keyboard, keeping its row and its focus', async () => {
      const wrapper = await mountWithStops(['A', 'B', 'C'], { attach: true })
      const [a, b, c] = rowElements(wrapper)
      const trigger = wrapper.get('[data-testid="stop-actions-2"]')
      ;(trigger.element as HTMLElement).focus()

      await trigger.trigger('keydown', { key: 'ArrowDown' })
      expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-up-2"]').element)
      // The last stop cannot move down; the arrow keys still stop on that
      // item, and choosing it does nothing and leaves the menu open.
      const menu = wrapper.get('[data-testid="stop-menu-2"]')
      await menu.trigger('keydown', { key: 'ArrowDown' })
      const down = wrapper.get('[data-testid="stop-down-2"]')
      expect(document.activeElement).toBe(down.element)
      ;(down.element as HTMLElement).click()
      await flushPromises()
      expect(stopNamesIn(wrapper)).toEqual(['A', 'B', 'C'])
      expect(document.activeElement).toBe(down.element)
      await menu.trigger('keydown', { key: 'ArrowUp' })
      expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-up-2"]').element)

      ;(document.activeElement as HTMLElement).click()
      await flushPromises()

      expect(stopNamesIn(wrapper)).toEqual(['A', 'C', 'B'])
      expect(rowElements(wrapper)).toEqual([a, c, b])
      expect(document.activeElement).toBe(trigger.element)
      expect(wrapper.get('[data-testid="stop-announcement"]').text()).toBe('C is now stop 2 of 3')

      await chooseStopAction(wrapper, 1, 'down')
      expect(stopNamesIn(wrapper)).toEqual(['A', 'B', 'C'])
      expect(rowElements(wrapper)).toEqual([a, b, c])
      wrapper.unmount()
    })

    it('offers no move past either end of the list', async () => {
      const wrapper = await mountWithStops(['A', 'B', 'C'])

      await wrapper.get('[data-testid="stop-actions-0"]').trigger('click')
      expect(wrapper.get('[data-testid="stop-up-0"]').attributes('aria-disabled')).toBe('true')
      expect(wrapper.get('[data-testid="stop-down-0"]').attributes('aria-disabled')).toBeUndefined()
      await wrapper.get('[data-testid="stop-actions-2"]').trigger('click')
      expect(wrapper.get('[data-testid="stop-down-2"]').attributes('aria-disabled')).toBe('true')
      expect(wrapper.get('[data-testid="stop-up-2"]').attributes('aria-disabled')).toBeUndefined()
    })

    it('announces a moved stop by its name, not by the position it has just left', async () => {
      const wrapper = await mountWithStops(['Fresno', 'Merced', 'Fresno'])

      await chooseStopAction(wrapper, 0, 'down')

      expect(stopNamesIn(wrapper)).toEqual(['Merced', 'Fresno', 'Fresno'])
      expect(wrapper.get('[data-testid="stop-announcement"]').text()).toBe('Fresno is now stop 2 of 3')
    })

    it('closes a stop\'s menu on Escape, back on its button, and leaves placing armed', async () => {
      const wrapper = await mountWithStops(['A'], { attach: true })
      await wrapper.get('[data-testid="toggle-place-stops"]').trigger('click')
      const trigger = wrapper.get('[data-testid="stop-actions-0"]')

      await trigger.trigger('click')
      expect(trigger.attributes('aria-expanded')).toBe('true')
      expect(trigger.attributes('aria-haspopup')).toBe('menu')
      // A lone stop can move neither way, so focus lands on the first item it can use.
      expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-edit-position-0"]').element)

      await wrapper.get('[data-testid="stop-menu-0"]').trigger('keydown', { key: 'Escape' })

      expect(wrapper.find('[data-testid="stop-menu-0"]').exists()).toBe(false)
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger.element)
      expect(mapStub(wrapper).props('placementArmed')).toBe(true)
      wrapper.unmount()
    })

    // jsdom has no DataTransfer, so the drag carries a stand-in that records
    // what the row put on it.
    function dataTransfer() {
      return { effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn() }
    }

    const DROP_BELOW = 'shadow-[0_3px_0_var(--color-coral)]'
    const DROP_ABOVE = 'shadow-[0_-3px_0_var(--color-coral)]'

    it('reorders by dragging a row down by its handle, keeping each row', async () => {
      const wrapper = await mountWithStops(['A', 'B', 'C'])
      const [a, b, c] = rowElements(wrapper)
      const rows = wrapper.findAll('[data-testid="stop-row"]')
      const transfer = dataTransfer()

      await wrapper.get('[data-testid="stop-drag-0"]').trigger('dragstart', { dataTransfer: transfer })
      await rows[2].trigger('dragover', { dataTransfer: transfer })
      expect(rows[2].classes()).toContain(DROP_BELOW)
      expect(transfer.dropEffect).toBe('move')
      await rows[2].trigger('drop', { dataTransfer: transfer })
      await wrapper.get('[data-testid="stop-drag-0"]').trigger('dragend')

      expect(transfer.effectAllowed).toBe('move')
      // Its own type, not text: a stop let go over a text field is not pasted in.
      expect(transfer.setData).toHaveBeenCalledWith('application/x-sparks-stop-id', useDraftsStore().serviceDraft!.stops[2].id)
      expect(transfer.setData).not.toHaveBeenCalledWith('text/plain', expect.anything())
      expect(transfer.setDragImage).toHaveBeenCalledWith(a, 16, 16)
      expect(stopNamesIn(wrapper)).toEqual(['B', 'C', 'A'])
      expect(rowElements(wrapper)).toEqual([b, c, a])
      expect(useDraftsStore().serviceDraft!.stops.map((stop) => stop.seq)).toEqual([0, 1, 2])
      expect(wrapper.get('[data-testid="stop-announcement"]').text()).toBe('A is now stop 3 of 3')
    })

    it('reorders by dragging a row up, marking the drop above the row it lands on', async () => {
      const wrapper = await mountWithStops(['A', 'B', 'C'])
      const [a, b, c] = rowElements(wrapper)
      const rows = wrapper.findAll('[data-testid="stop-row"]')
      const transfer = dataTransfer()

      await wrapper.get('[data-testid="stop-drag-2"]').trigger('dragstart', { dataTransfer: transfer })
      await rows[0].trigger('dragover', { dataTransfer: transfer })
      expect(rows[0].classes()).toContain(DROP_ABOVE)
      await rows[0].trigger('drop', { dataTransfer: transfer })

      expect(stopNamesIn(wrapper)).toEqual(['C', 'A', 'B'])
      expect(rowElements(wrapper)).toEqual([c, a, b])
    })

    it('takes the drop line away when the drag leaves the row, but not for one of its own children', async () => {
      const wrapper = await mountWithStops(['A', 'B', 'C'])
      const rows = wrapper.findAll('[data-testid="stop-row"]')
      const dropLines = () => wrapper.findAll('[data-testid="stop-row"]').filter((row) => row.classes(DROP_BELOW))

      await wrapper.get('[data-testid="stop-drag-0"]').trigger('dragstart', { dataTransfer: dataTransfer() })
      await rows[2].trigger('dragover')
      await rows[2].trigger('dragleave', { relatedTarget: rows[2].get('input').element })
      expect(dropLines()).toHaveLength(1)

      await rows[2].trigger('dragleave', { relatedTarget: document.body })
      expect(dropLines()).toHaveLength(0)

      await rows[2].trigger('dragover')
      expect(dropLines()).toHaveLength(1)
      await wrapper.get('[data-testid="stop-drag-0"]').trigger('dragend')
      expect(dropLines()).toHaveLength(0)
      expect(stopNamesIn(wrapper)).toEqual(['A', 'B', 'C'])
    })

    it('ignores a drop that no handle started', async () => {
      const wrapper = await mountWithStops(['A', 'B'])

      await wrapper.findAll('[data-testid="stop-row"]')[1].trigger('drop')

      expect(stopNamesIn(wrapper)).toEqual(['A', 'B'])
    })

    it('gives every control in a row a name of its own that says which stop it is for', async () => {
      const wrapper = await mountWithStops(['Fresno', 'Merced', 'Fresno'])
      const names: string[] = []

      for (const [index, stopName] of ['Fresno', 'Merced', 'Fresno'].entries()) {
        await chooseStopAction(wrapper, index, 'edit-position')
        await wrapper.get(`[data-testid="stop-actions-${index}"]`).trigger('click')
        const row = wrapper.findAll('[data-testid="stop-row"]')[index]
        const controls = row.findAll('input, button')
        // The name field, the menu and its five items, both coordinates and Done.
        expect(controls).toHaveLength(10)
        for (const control of controls) {
          const accessible = accessibleName(control.element)
          expect(accessible).toContain(stopName)
          names.push(accessible)
        }
        await wrapper.get(`[data-testid="stop-menu-${index}"]`).trigger('keydown', { key: 'Escape' })
      }

      expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length)
      expect(names).toEqual(expect.arrayContaining([
        'Rename Merced',
        'Actions for Merced',
        'Move Merced up',
        'Move Merced down',
        'Remove Merced',
        'Show Merced on map',
        'Remove Fresno (stop 1)',
        'Remove Fresno (stop 3)',
      ]))
    })

    // A screen reader says "Stop 2" and "stop 2" alike, so a name that differs
    // only in case is still a name two buttons would share.
    it('keeps a stop with no name apart from one named for its number', async () => {
      const wrapper = await mountWithStops(['Stop 2', 'X', 'stop 2'])

      await wrapper.get('[data-testid="stop-edit-name-1"]').setValue('  ')

      const labels = wrapper.findAll('[data-testid^="stop-edit-name-"]').map((input) => input.attributes('aria-label')!)
      expect(labels).toEqual(['Rename Stop 2 (stop 1)', 'Rename Unnamed stop 2', 'Rename stop 2 (stop 3)'])
      expect(new Set(labels.map((label) => label.toLowerCase())).size).toBe(3)
    })

    it('centres the map on a stop when its row is clicked, and marks it on the map and in the list', async () => {
      const wrapper = await mountWithStops(['A', 'B'])
      const rows = wrapper.findAll('[data-testid="stop-row"]')

      await rows[1].trigger('click')

      const first = mapStub(wrapper).props('centerOn')
      expect(first).toEqual({ lat: 2, lng: 2 })
      expect(rows[1].attributes('aria-current')).toBe('true')
      expect(rows[0].attributes('aria-current')).toBeUndefined()
      expect(mapStub(wrapper).props('stopPreviewPairs').map((pair: { selected?: boolean }) => !!pair.selected)).toEqual([false, true])

      // Asked again after the author has panned away, it has to move the map
      // again, so it is a new request rather than the same one.
      await rows[1].trigger('click')
      expect(mapStub(wrapper).props('centerOn')).not.toBe(first)
      expect(mapStub(wrapper).props('centerOn')).toEqual({ lat: 2, lng: 2 })
    })

    it('centres the map on a stop from Show on map', async () => {
      const wrapper = await mountWithStops(['A', 'B'])

      await chooseStopAction(wrapper, 0, 'show')

      expect(mapStub(wrapper).props('centerOn')).toEqual({ lat: 1, lng: 1 })
      expect(wrapper.findAll('[data-testid="stop-row"]')[0].attributes('aria-current')).toBe('true')
    })

    it('does not centre the map when a row\'s menu is opened', async () => {
      const wrapper = await mountWithStops(['A', 'B'])

      await wrapper.get('[data-testid="stop-actions-1"]').trigger('click')

      expect(mapStub(wrapper).props('centerOn')).toBeNull()
    })

    it('does not centre the map when a row\'s own fields are clicked into', async () => {
      const wrapper = await mountWithStops(['A', 'B'])
      await chooseStopAction(wrapper, 1, 'edit-position')

      await wrapper.get('[data-testid="stop-edit-name-1"]').trigger('click')
      await wrapper.get('[data-testid="stop-edit-lat-1"]').trigger('click')
      await wrapper.get('[data-testid="stop-position-1"] label').trigger('click')
      await wrapper.get('[data-testid="stop-position-done-1"]').trigger('click')
      expect(mapStub(wrapper).props('centerOn')).toBeNull()

      await wrapper.findAll('[data-testid="stop-seq"]')[1].trigger('click')
      expect(mapStub(wrapper).props('centerOn')).toEqual({ lat: 2, lng: 2 })
    })

    function hovered(wrapper: ReturnType<typeof mountView>): boolean[] {
      return wrapper.findAll('[data-testid="stop-row"]').map((row) => row.classes('bg-coral/10'))
    }

    it('highlights the row of the stop hovered on the map', async () => {
      const wrapper = await mountWithStops(['A', 'B'])

      mapStub(wrapper).vm.$emit('stop-hover', '1')
      await flushPromises()
      expect(hovered(wrapper)).toEqual([false, true])

      mapStub(wrapper).vm.$emit('stop-hover', null)
      await flushPromises()
      expect(hovered(wrapper)).toEqual([false, false])
    })

    it('keeps the highlight on the hovered stop when the list is reordered under it, and drops it when the stop goes', async () => {
      const wrapper = await mountWithStops(['A', 'B', 'C'])

      mapStub(wrapper).vm.$emit('stop-hover', '2')
      await flushPromises()
      await chooseStopAction(wrapper, 2, 'up')
      expect(stopNamesIn(wrapper)).toEqual(['A', 'C', 'B'])
      expect(hovered(wrapper)).toEqual([false, true, false])

      await chooseStopAction(wrapper, 1, 'remove')
      await hosts.confirmButton().trigger('click')
      await flushPromises()
      expect(hovered(wrapper)).toEqual([false, false])
    })

    it('names the stop in the confirmation, and keeps the stop list otherwise intact', async () => {
      const wrapper = await mountWithStops(['Fresno', 'Merced'])

      await chooseStopAction(wrapper, 1, 'remove')

      expect(hosts.dialog().text()).toContain('Merced comes off the route')
      await hosts.confirmButton().trigger('click')
      await flushPromises()
      expect(stopNamesIn(wrapper)).toEqual(['Fresno'])
    })

    it('says which of two stops sharing a name the confirmation is about', async () => {
      const wrapper = await mountWithStops(['Fresno', 'Merced', 'Fresno'])

      await chooseStopAction(wrapper, 2, 'remove')

      expect(hosts.dialog().text()).toContain('Fresno (stop 3) comes off the route')
    })
  })

  describe('a rejected write that names the offending stops', () => {
    // Drives the form to a submittable state and submits it, so each case below
    // only has to say what the server answered.
    async function submitAgainst(rejection: ApiError) {
      vi.mocked(createService).mockRejectedValue(rejection)
      const wrapper = mountView()
      await flushPromises()
      await wrapper.find('[data-testid="route-select"]').setValue('main-line')
      await flushPromises()
      await addStop(wrapper, 'A', 37.77, -122.41)
      await addStop(wrapper, 'B', 37.33, -121.88)
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      await wrapper.find('[data-testid="service-name"]').setValue('Northbound Express')
      await wrapper.find('[data-testid="frequency-headway"]').setValue(15)
      await wrapper.find('[data-testid="add-frequency"]').trigger('click')

      await wrapper.find('form').trigger('submit')
      await flushPromises()
      return wrapper
    }

    function flaggedRows(wrapper: ReturnType<typeof mountView>): number[] {
      return wrapper
        .findAll('[data-testid="stop-row"]')
        .flatMap((row, index) => (row.find('[data-testid="stop-submit-error"]').exists() ? [index] : []))
    }

    it('flags only the stop an off-route fault names', async () => {
      const wrapper = await submitAgainst(
        new ApiError('POST /api/services failed: 422: rejected', 422, 'stop_placement', {
          fault: 'off_route',
          route_slug: 'main-line',
          threshold_m: 500,
          stops: [{ seq: 1, name: 'B', slug: 'b', chainage_m: 12000, offset_m: 620 }],
        }),
      )
      expect(flaggedRows(wrapper)).toEqual([1])
    })

    it('reports how far off the route the stop landed', async () => {
      const wrapper = await submitAgainst(
        new ApiError('POST /api/services failed: 422: rejected', 422, 'stop_placement', {
          fault: 'off_route',
          route_slug: 'main-line',
          threshold_m: 500,
          stops: [{ seq: 1, name: 'B', slug: 'b', chainage_m: 12000, offset_m: 620 }],
        }),
      )
      const flagged = wrapper.findAll('[data-testid="stop-row"]')[1]
      expect(flagged.find('[data-testid="stop-submit-error"]').text()).toContain('620')
    })

    it('flags both stops an order fault names', async () => {
      const wrapper = await submitAgainst(
        new ApiError('POST /api/services failed: 422: rejected', 422, 'stop_placement', {
          fault: 'chainage_order',
          route_slug: 'main-line',
          stops: [
            { seq: 0, name: 'A', slug: 'a', chainage_m: 12000, offset_m: 4 },
            { seq: 1, name: 'B', slug: 'b', chainage_m: 8000, offset_m: 2 },
          ],
        }),
      )
      expect(flaggedRows(wrapper)).toEqual([0, 1])
    })

    // The rows are keyed off seq, so renaming a stop after authoring it cannot
    // cost it its flag — which is exactly what prose parsing could not promise.
    it('flags by position rather than by stop name', async () => {
      const wrapper = await submitAgainst(
        new ApiError('POST /api/services failed: 422: rejected', 422, 'stop_placement', {
          fault: 'off_route',
          route_slug: 'main-line',
          threshold_m: 500,
          stops: [{ seq: 1, name: 'renamed since', slug: 'b', chainage_m: 12000, offset_m: 620 }],
        }),
      )
      expect(flaggedRows(wrapper)).toEqual([1])
    })

    it('falls back to the banner alone when the detail is not one it recognizes', async () => {
      const wrapper = await submitAgainst(
        new ApiError('POST /api/services failed: 422: some new rule', 422, 'stop_placement', {
          fault: 'a_rule_from_the_future',
          route_slug: 'main-line',
          stops: [{ seq: 1, name: 'B', slug: 'b', chainage_m: 12000, offset_m: 620 }],
        }),
      )
      expect(flaggedRows(wrapper)).toEqual([])
      expect(wrapper.find('[data-testid="submit-error"]').text()).toBe(
        "Some stops don't sit on the route. Check the flagged stops and save again.",
      )
    })

    it('falls back to the banner alone for a rejection carrying no detail', async () => {
      const wrapper = await submitAgainst(
        new ApiError('POST /api/services failed: 422: route_slug is required', 422),
      )
      expect(flaggedRows(wrapper)).toEqual([])
      expect(wrapper.find('[data-testid="submit-error"]').text()).toBe(
        "Some of this line's details weren't accepted. Check them and try again.",
      )
    })
  })

  it('asks what the service is called before where it runs, how it runs, and what it is for', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('form h2').map((h) => h.text())).toEqual([
      'Identity',
      'Route & stops',
      'Operations',
      'Description optional',
    ])
    expect(wrapper.findAll('form h3').map((h) => h.text())).toEqual(['Vehicle', 'Frequency windows'])
    const inputs = wrapper.findAll('form input')
    expect(inputs[0].attributes('data-testid')).toBe('service-name')
    expect(inputs[1].attributes('data-testid')).toBe('service-subtext')
  })

  it('sits the map directly after Route & stops, between it and Operations', async () => {
    const wrapper = mountView()
    await flushPromises()

    const blocks = [...wrapper.get('[data-testid="form-body"]').element.children].map(
      (child) => child.querySelector('h2')?.textContent?.trim() ?? child.getAttribute('data-testid'),
    )
    expect(blocks).toEqual(['Identity', 'Route & stops', 'map-panel', 'Operations', 'Description optional'])
    expect(wrapper.get('[data-testid="map-panel"]').findComponent({ name: 'MapView' }).exists()).toBe(true)
  })

  it('ends the form column with a sticky save bar, and offers no discard on a create', async () => {
    const wrapper = mountView()
    await flushPromises()

    const bar = wrapper.get('[data-testid="save-bar"]')
    expect(bar.classes()).toEqual(expect.arrayContaining(['sticky', 'bottom-0']))
    expect(bar.element.parentElement?.lastElementChild).toBe(bar.element)
    expect(bar.find('[data-testid="submit"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="discard-edit"]').exists()).toBe(false)
  })

  it('reads "Nothing here yet" on a fresh create, and "Not created yet" once it is started', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(saveStatus(wrapper)).toBe('Nothing here yet')

    await wrapper.find('[data-testid="service-name"]').setValue('Northbound Express')

    expect(saveStatus(wrapper)).toBe('Not created yet · Draft kept in this browser')
  })

  it('disables submit until a route, two stops, name, and a frequency window are set', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="submit"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="route-select"]').setValue('main-line')
    await flushPromises()
    await addStop(wrapper, 'A', 37.77, -122.41)
    await addStop(wrapper, 'B', 37.33, -121.88)
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    await wrapper.find('[data-testid="service-name"]').setValue('Northbound Express')
    await wrapper.find('[data-testid="frequency-headway"]').setValue(15)
    await wrapper.find('[data-testid="add-frequency"]').trigger('click')

    expect(wrapper.find('[data-testid="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('names each frequency window\'s remove button after the window, not the ✕ it shows', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="frequency-headway"]').setValue(15)
    await wrapper.find('[data-testid="add-frequency"]').trigger('click')

    const remove = wrapper.get('[data-testid="frequency-remove-0"]')
    expect(remove.attributes('aria-label')).toBe('Remove the 06:00–22:00 window')
  })

  describe('creating a service', () => {
    const Stub = { template: '<div>stub</div>' }

    async function mountNew() {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/authoring/services/new', name: 'new-service', component: ServiceAuthoringView },
          { path: '/authoring/services/:slug', name: 'service-detail', component: Stub, props: true },
        ],
      })
      await router.push('/authoring/services/new')
      const wrapper = mount(ServiceAuthoringView, {
        global: { plugins: [router], stubs: { MapView: true } },
      })
      await flushPromises()
      await wrapper.find('[data-testid="route-select"]').setValue('main-line')
      await flushPromises()
      await addStop(wrapper, 'A', 37.77, -122.41)
      await addStop(wrapper, 'B', 37.33, -121.88)
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      await wrapper.find('[data-testid="service-name"]').setValue('Northbound Express')
      await wrapper.find('[data-testid="frequency-headway"]').setValue(15)
      await wrapper.find('[data-testid="add-frequency"]').trigger('click')
      return { wrapper, router }
    }

    it('shows where it sits: a new service, under My authoring', async () => {
      const { wrapper } = await mountNew()

      expect(breadcrumbTrail(wrapper)).toEqual([
        ['My authoring', '/authoring'],
        ['New line', null],
      ])
    })

    it('picks the route the builder sent back in ?route=, then drops the query', async () => {
      vi.mocked(fetchMyRoutes).mockResolvedValue([{ id: 'rt9', slug: 'my-spur', name: 'My Spur', mode: 'tram', length_m: 1200 }])
      vi.mocked(fetchRoute).mockResolvedValue({ ...stubRoute, id: 'rt9', slug: 'my-spur', name: 'My Spur' })
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/authoring/services/new', name: 'new-service', component: ServiceAuthoringView }],
      })
      await router.push('/authoring/services/new?route=my-spur')
      const wrapper = mount(ServiceAuthoringView, { global: { plugins: [router], stubs: { MapView: true } } })
      await flushPromises()

      expect(fetchRoute).toHaveBeenCalledWith('my-spur')
      expect((wrapper.get('[data-testid="route-select"]').element as HTMLSelectElement).value).toBe('my-spur')
      expect(router.currentRoute.value.fullPath).toBe('/authoring/services/new')
    })

    it('lands on the new service\'s page, which compiles it, rather than compiling here', async () => {
      const { wrapper, router } = await mountNew()

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(createService).toHaveBeenCalledWith(expect.objectContaining({ route_slug: 'main-line', name: 'Northbound Express' }))
      expect(compileService).not.toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe('/authoring/services/northbound-express')
    })

    it('locks the form while creating, then says so and leaves, with no interstitial', async () => {
      const creating = deferred<Service>()
      vi.mocked(createService).mockReturnValue(creating.promise)
      const { wrapper, router } = await mountNew()

      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(saveStatus(wrapper)).toBe('Creating…')
      expect(formLocked(wrapper)).toBe(true)

      creating.resolve(stubService)
      await flushPromises()
      expect(hosts.toasts()).toEqual(['Line created'])
      expect(router.currentRoute.value.path).toBe('/authoring/services/northbound-express')
      expect(wrapper.find('[data-testid="compiling-status"]').exists()).toBe(false)
    })

    it('reads "Couldn\'t save" and unlocks the form when the create is refused', async () => {
      vi.mocked(createService).mockRejectedValue(new ApiError('nope', 500))
      const { wrapper } = await mountNew()

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(saveStatus(wrapper)).toBe("Couldn't save · Your draft is still kept in this browser")
      expect(wrapper.get('[data-testid="save-bar"] [data-testid="submit-error"]').attributes('role')).toBe('alert')
      expect(formLocked(wrapper)).toBe(false)
    })

    it('replaces the form in history, so going back does not reopen it', async () => {
      const { wrapper, router } = await mountNew()
      const replace = vi.spyOn(router, 'replace')
      const push = vi.spyOn(router, 'push')

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(replace).toHaveBeenCalledWith('/authoring/services/northbound-express')
      expect(push).not.toHaveBeenCalled()
    })

    it('sends the subtext and description typed into the form', async () => {
      const { wrapper } = await mountNew()
      await wrapper.find('[data-testid="service-subtext"]').setValue('Electrified · High-speed rail')
      await wrapper.find('textarea[data-testid="service-description"]').setValue('Runs the spine.\n\nStops at every town.')

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(createService).toHaveBeenCalledWith(expect.objectContaining({
        subtext: 'Electrified · High-speed rail',
        description: 'Runs the spine.\n\nStops at every town.',
      }))
    })

    it('sends the four vehicle values a preset filled in', async () => {
      const { wrapper } = await mountNew()
      await wrapper.find('[data-testid="vehicle-preset-option-regional_rail"]').setValue(true)

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(createService).toHaveBeenCalledWith(expect.objectContaining({
        vehicle: { max_speed_kmh: 177, acceleration_ms2: 0.6, deceleration_ms2: 0.7, dwell_s: 45 },
      }))
    })

    it('sends km/h even when the speed was typed in mph', async () => {
      const { wrapper } = await mountNew()
      await wrapper.find('[data-testid="vehicle-speed-unit-option-mph"]').setValue(true)
      await wrapper.find('[data-testid="vehicle-max-speed"]').setValue(110)

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(createService).toHaveBeenCalledWith(expect.objectContaining({
        vehicle: expect.objectContaining({ max_speed_kmh: 177 }),
      }))
    })

    it('stays on the form with the draft and the stop faults when the create is refused', async () => {
      vi.mocked(createService).mockRejectedValue(
        new ApiError('POST /api/services failed: 422: rejected', 422, 'stop_placement', {
          fault: 'off_route',
          route_slug: 'main-line',
          threshold_m: 500,
          stops: [{ seq: 1, name: 'B', slug: 'b', chainage_m: 12000, offset_m: 620 }],
        }),
      )
      const { wrapper, router } = await mountNew()

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/authoring/services/new')
      expect(wrapper.find('[data-testid="submit-error"]').text()).toBe(
        'Stop "B" is too far from the route. Move it onto the route and save again.',
      )
      expect(wrapper.findAll('[data-testid="stop-row"]').map(stopRowName)).toEqual(['A', 'B'])
      expect(wrapper.find('[data-testid="service-name"]').element).toHaveProperty('value', 'Northbound Express')
      const flagged = wrapper.findAll('[data-testid="stop-row"]').map((row) => row.find('[data-testid="stop-submit-error"]').exists())
      expect(flagged).toEqual([false, true])
    })
  })

  it('bounds the subtext and description at the lengths the API accepts', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="service-subtext"]').attributes('maxlength')).toBe('140')
    expect(wrapper.find('[data-testid="service-description"]').attributes('maxlength')).toBe('4000')
  })

  it('shows a plain-language summary, not the API message, when creation is rejected', async () => {
    vi.mocked(createService).mockRejectedValue(
      new ApiError('POST /api/services failed: 422: stop "B" is 620 m from route "main-line"', 422),
    )

    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="route-select"]').setValue('main-line')
    await flushPromises()
    await addStop(wrapper, 'A', 37.77, -122.41)
    await addStop(wrapper, 'B', 37.33, -121.88)
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    await wrapper.find('[data-testid="service-name"]').setValue('Northbound Express')
    await wrapper.find('[data-testid="frequency-headway"]').setValue(15)
    await wrapper.find('[data-testid="add-frequency"]').trigger('click')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="submit-error"]').text()).toBe(
      "Some of this line's details weren't accepted. Check them and try again.",
    )
    expect(compileService).not.toHaveBeenCalled()
  })

  describe('placing stops by clicking the map', () => {
    function toggle(wrapper: ReturnType<typeof mountView>) {
      return wrapper.find('[data-testid="toggle-place-stops"]')
    }

    async function clickMap(wrapper: ReturnType<typeof mountView>, lat: number, lng: number) {
      mapStub(wrapper).vm.$emit('map-click', { lat, lng })
      await flushPromises()
    }

    function stopNames(wrapper: ReturnType<typeof mountView>): string[] {
      return wrapper.findAll('[data-testid="stop-row"]').map(stopRowName)
    }

    it('arms and disarms the map from the Stops-section toggle', async () => {
      const wrapper = mountView()
      await flushPromises()

      expect(mapStub(wrapper).props('placementArmed')).toBe(false)
      expect(toggle(wrapper).attributes('aria-pressed')).toBe('false')

      await toggle(wrapper).trigger('click')
      expect(mapStub(wrapper).props('placementArmed')).toBe(true)
      // Pressed says it is on; the label stays what the button does.
      expect(toggle(wrapper).attributes('aria-pressed')).toBe('true')
      expect(toggle(wrapper).text()).toBe('Add stops by clicking the map')

      await toggle(wrapper).trigger('click')
      expect(mapStub(wrapper).props('placementArmed')).toBe(false)
      expect(toggle(wrapper).attributes('aria-pressed')).toBe('false')
    })

    it('appends a stop at the clicked point, auto-named from a counter', async () => {
      const wrapper = mountView()
      await flushPromises()
      await toggle(wrapper).trigger('click')

      await clickMap(wrapper, 37.77, -122.41)
      await clickMap(wrapper, 37.33, -121.88)

      const stops = useDraftsStore().serviceDraft!.stops
      expect(stops).toEqual([
        { id: expect.any(String), name: 'Stop 1', lat: 37.77, lng: -122.41, seq: 0 },
        { id: expect.any(String), name: 'Stop 2', lat: 37.33, lng: -121.88, seq: 1 },
      ])
      expect(stopNames(wrapper)).toEqual(['Stop 1', 'Stop 2'])
    })

    it('appends clicked stops after typed ones rather than replacing them', async () => {
      const wrapper = mountView()
      await flushPromises()
      await addStop(wrapper, 'SF', 37.77, -122.41)
      await toggle(wrapper).trigger('click')

      await clickMap(wrapper, 37.33, -121.88)

      expect(stopNames(wrapper)).toEqual(['SF', 'Stop 1'])
    })

    it('never reuses a stop number after a delete', async () => {
      const wrapper = mountView()
      await flushPromises()
      await toggle(wrapper).trigger('click')

      await clickMap(wrapper, 37.77, -122.41)
      await clickMap(wrapper, 37.33, -121.88)
      await chooseStopAction(wrapper, 1, 'remove')
      await hosts.confirmButton().trigger('click')
      await flushPromises()
      await clickMap(wrapper, 38.0, -122.0)

      expect(stopNames(wrapper)).toEqual(['Stop 1', 'Stop 3'])
    })

    it('stays armed while the rest of the form is used', async () => {
      const wrapper = mountView()
      await flushPromises()
      await toggle(wrapper).trigger('click')

      await wrapper.find('[data-testid="service-name"]').setValue('Northbound Express')
      await wrapper.find('[data-testid="vehicle-dwell"]').setValue(45)

      expect(mapStub(wrapper).props('placementArmed')).toBe(true)
    })

    it('disarms on Escape', async () => {
      const wrapper = mountView()
      await flushPromises()
      await toggle(wrapper).trigger('click')

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()

      expect(mapStub(wrapper).props('placementArmed')).toBe(false)
    })

    it('stores the raw clicked coordinates and feeds them to the snap preview', async () => {
      const wrapper = mountView()
      await flushPromises()
      await wrapper.find('[data-testid="route-select"]').setValue('main-line')
      await flushPromises()
      await toggle(wrapper).trigger('click')

      await clickMap(wrapper, 37.77, -122.41)
      await vi.advanceTimersByTimeAsync(400)

      expect(snapStops).toHaveBeenCalledWith('main-line', [{ lat: 37.77, lng: -122.41 }])
    })

    it('leaves the typed Name / Lat / Lng row usable while armed', async () => {
      const wrapper = mountView()
      await flushPromises()
      await toggle(wrapper).trigger('click')

      await addStop(wrapper, 'SF', 37.77, -122.41)

      expect(stopNames(wrapper)).toEqual(['SF'])
    })
  })

  // Handing the map a new pair list redraws every pin, which reads on screen as
  // a flicker. Editing a service's name or its vehicle moves no stop, so the
  // map must be given nothing to redraw.
  describe('stop preview stability', () => {
    it('leaves the stop preview untouched when unrelated fields change', async () => {
      const wrapper = await mountWithTwoStops()
      const before = mapStub(wrapper).props('stopPreviewPairs')

      await wrapper.find('[data-testid="service-name"]').setValue('Northbound Express')
      await wrapper.find('[data-testid="vehicle-max-speed"]').setValue(120)
      await flushPromises()

      expect(mapStub(wrapper).props('stopPreviewPairs')).toBe(before)
      expect(snapStops).not.toHaveBeenCalled()
    })

    it('still redraws the preview when a stop moves', async () => {
      const wrapper = await mountWithTwoStops()
      await chooseStopAction(wrapper, 0, 'edit-position')
      const before = mapStub(wrapper).props('stopPreviewPairs')

      await wrapper.find('[data-testid="stop-edit-lat-0"]').setValue(37.8)
      await flushPromises()

      const after = mapStub(wrapper).props('stopPreviewPairs')
      expect(after).not.toBe(before)
      expect(after[0].raw).toEqual({ lat: 37.8, lng: -122.41 })
    })
  })

  describe('dragging a stop pin to reposition it', () => {
    async function drag(
      wrapper: ReturnType<typeof mountView>,
      id: string,
      moves: { lat: number; lng: number }[],
      drop: { lat: number; lng: number },
    ) {
      for (const move of moves) mapStub(wrapper).vm.$emit('stop-drag', id, move)
      await flushPromises()
      mapStub(wrapper).vm.$emit('stop-drag-end', id, drop)
      await flushPromises()
    }

    it('moves the dragged stop and leaves names and ordering alone', async () => {
      const wrapper = await mountWithTwoStops()

      await drag(wrapper, '0', [{ lat: 37.8, lng: -122.4 }], { lat: 37.85, lng: -122.35 })

      expect(useDraftsStore().serviceDraft!.stops).toEqual([
        { id: expect.any(String), name: 'SF', lat: 37.85, lng: -122.35, seq: 0 },
        { id: expect.any(String), name: 'SJ', lat: 37.33, lng: -121.88, seq: 1 },
      ])
    })

    it('reflects the dropped position in the inline lat/lng editors', async () => {
      const wrapper = await mountWithTwoStops()

      await drag(wrapper, '0', [], { lat: 37.85, lng: -122.35 })
      await chooseStopAction(wrapper, 0, 'edit-position')

      const lat = wrapper.find('[data-testid="stop-edit-lat-0"]').element as HTMLInputElement
      const lng = wrapper.find('[data-testid="stop-edit-lng-0"]').element as HTMLInputElement
      expect(Number(lat.value)).toBe(37.85)
      expect(Number(lng.value)).toBe(-122.35)
    })

    it('re-runs the snap preview once on drop, not during the drag', async () => {
      const wrapper = await mountWithTwoStops()

      for (const move of [{ lat: 37.8, lng: -122.4 }, { lat: 37.82, lng: -122.38 }]) {
        mapStub(wrapper).vm.$emit('stop-drag', '0', move)
        await flushPromises()
        await vi.advanceTimersByTimeAsync(400)
      }
      expect(snapStops).not.toHaveBeenCalled()

      mapStub(wrapper).vm.$emit('stop-drag-end', '0', { lat: 37.85, lng: -122.35 })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(snapStops).toHaveBeenCalledTimes(1)
      expect(snapStops).toHaveBeenCalledWith('main-line', [
        { lat: 37.85, lng: -122.35 },
        { lat: 37.33, lng: -121.88 },
      ])
    })

    it('follows the pointer during the drag', async () => {
      const wrapper = await mountWithTwoStops()

      mapStub(wrapper).vm.$emit('stop-drag', '0', { lat: 37.8, lng: -122.4 })
      await flushPromises()

      expect(useDraftsStore().serviceDraft!.stops[0]).toMatchObject({ lat: 37.8, lng: -122.4 })
      expect(mapStub(wrapper).props('stopPreviewPairs')[0].raw).toEqual({ lat: 37.8, lng: -122.4 })
    })

    it('clears the off-route warning when a stop is dragged onto the line', async () => {
      vi.mocked(snapStops).mockResolvedValue(
        snapResponse({
          stops: [
            { input: { lat: 38.5, lng: -123.5 }, snapped: { lat: 37.77, lng: -122.41 }, chainage_m: 0, offset_m: 620, off_route: true },
            { input: { lat: 37.33, lng: -121.88 }, snapped: { lat: 37.33, lng: -121.88 }, chainage_m: 1000, offset_m: 0, off_route: false },
          ],
        }),
      )
      const wrapper = mountView()
      await flushPromises()
      await wrapper.find('[data-testid="route-select"]').setValue('main-line')
      await flushPromises()
      await addStop(wrapper, 'SF', 38.5, -123.5)
      await addStop(wrapper, 'SJ', 37.33, -121.88)
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      expect(wrapper.find('[data-testid="stop-off-route"]').exists()).toBe(true)

      vi.mocked(snapStops).mockResolvedValue(snapResponse())
      await drag(wrapper, '0', [], { lat: 37.77, lng: -122.41 })
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(wrapper.find('[data-testid="stop-off-route"]').exists()).toBe(false)
    })

    it('does not touch the Stop N counter, so a later click keeps counting up', async () => {
      const wrapper = mountView()
      await flushPromises()
      await wrapper.find('[data-testid="toggle-place-stops"]').trigger('click')
      mapStub(wrapper).vm.$emit('map-click', { lat: 37.77, lng: -122.41 })
      await flushPromises()

      await drag(wrapper, '0', [], { lat: 37.85, lng: -122.35 })
      mapStub(wrapper).vm.$emit('map-click', { lat: 37.33, lng: -121.88 })
      await flushPromises()

      expect(wrapper.findAll('[data-testid="stop-row"]').map(stopRowName)).toEqual(['Stop 1', 'Stop 2'])
    })
  })

  describe('editing an existing service', () => {
    const savedService: Service = {
      id: 'svc1',
      slug: 'northbound-express',
      route_id: 'rt1',
      name: 'Northbound Express',
      subtext: 'Electrified · High-speed rail',
      description: 'Runs the spine.',
      stops: [
        { name: 'SF', lat: 37.77, lng: -122.41, seq: 0 },
        { name: 'SJ', lat: 37.33, lng: -121.88, seq: 1 },
      ],
      vehicle: { max_speed_kmh: 320, acceleration_ms2: 1.1, deceleration_ms2: 1.2, dwell_s: 45 },
      frequency_windows: [{ start_time: '06:00', end_time: '22:00', headway_s: 900 }],
    }

    const Stub = { template: '<div>stub</div>' }

    async function mountEdit(slug = 'northbound-express') {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/authoring/services/:slug', name: 'service-detail', component: Stub, props: true },
          { path: '/authoring/services/:slug/edit', name: 'edit-service', component: ServiceAuthoringView, props: true },
        ],
      })
      await router.push(`/authoring/services/${slug}/edit`)
      const wrapper = mount(ServiceAuthoringView, {
        props: { slug },
        global: { plugins: [router], stubs: { MapView: true } },
      })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      return { wrapper, router }
    }

    function fieldValue(wrapper: Awaited<ReturnType<typeof mountEdit>>['wrapper'], testId: string): string {
      return (wrapper.find(`[data-testid="${testId}"]`).element as HTMLInputElement).value
    }

    beforeEach(() => {
      vi.mocked(fetchService).mockResolvedValue(savedService)
      vi.mocked(fetchServiceGraph).mockResolvedValue({ services: [], routes: [stubRoute] } as unknown as TransitGraph)
      vi.mocked(updateService).mockResolvedValue(savedService)
    })

    it('arrives with the service\'s stops, vehicle, windows and prose filled in', async () => {
      const { wrapper } = await mountEdit()

      expect(wrapper.find('h1').text()).toBe('Edit line')
      expect(fieldValue(wrapper, 'route-select')).toBe('main-line')
      expect(fieldValue(wrapper, 'service-name')).toBe('Northbound Express')
      expect(fieldValue(wrapper, 'service-subtext')).toBe('Electrified · High-speed rail')
      expect(fieldValue(wrapper, 'service-description')).toBe('Runs the spine.')
      expect(wrapper.findAll('[data-testid="stop-row"]').map(stopRowName)).toEqual(['SF', 'SJ'])
      expect(fieldValue(wrapper, 'vehicle-max-speed')).toBe('320')
      expect(fieldValue(wrapper, 'vehicle-dwell')).toBe('45')
      expect(wrapper.find('[data-testid="frequency-list"]').text()).toContain('06:00–22:00, every 15 min')
      expect(wrapper.find('[data-testid="submit"]').text()).toBe('Save changes')
    })

    it('reads the saved vehicle as Custom when it equals no preset', async () => {
      const { wrapper } = await mountEdit()

      expect((wrapper.get('[data-testid="vehicle-preset-option-custom"]').element as HTMLInputElement).checked).toBe(true)
    })

    it('reads the saved vehicle as its preset when it equals one', async () => {
      vi.mocked(fetchService).mockResolvedValue({
        ...savedService,
        vehicle: { max_speed_kmh: 320, acceleration_ms2: 0.5, deceleration_ms2: 0.65, dwell_s: 90 },
      })
      const { wrapper } = await mountEdit()

      expect((wrapper.get('[data-testid="vehicle-preset-option-high_speed_rail"]').element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get('[data-testid="vehicle-preset-option-custom"]').element as HTMLInputElement).checked).toBe(false)
      expect(fieldValue(wrapper, 'vehicle-max-speed')).toBe('320')
    })

    it('names the tab after the saved service, not the name being typed', async () => {
      const { wrapper } = await mountEdit()
      expect(document.title).toBe('Edit Northbound Express · Sparks Effect')

      await wrapper.find('[data-testid="service-name"]').setValue('Southbound')
      await flushPromises()
      expect(document.title).toBe('Edit Northbound Express · Sparks Effect')
    })

    it('shows where it sits: editing the service, under My authoring', async () => {
      const { wrapper } = await mountEdit()

      expect(breadcrumbTrail(wrapper)).toEqual([
        ['My authoring', '/authoring'],
        ['Northbound Express', '/authoring/services/northbound-express'],
        ['Edit', null],
      ])
    })

    it('saves with a PUT, then lands on the service once it has recompiled', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'job1', kind: 'compile_user_service', status: 'succeeded', result: { services: [] } }),
      } as Response)
      const { wrapper, router } = await mountEdit()
      await wrapper.find('[data-testid="service-description"]').setValue('Runs the whole spine.')

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(hosts.toasts()).toEqual(['Changes saved'])
      expect(updateService).toHaveBeenCalledWith('northbound-express', expect.objectContaining({
        name: 'Northbound Express',
        description: 'Runs the whole spine.',
      }))
      expect(createService).not.toHaveBeenCalled()
      expect(compileService).toHaveBeenCalledWith('northbound-express', expect.any(Object))
      expect(router.currentRoute.value.path).toBe('/authoring/services/northbound-express')
    })

    it('stays put and offers the way back when the recompile fails', async () => {
      vi.mocked(compileService).mockRejectedValue(new Error('compile exploded'))
      const { wrapper, router } = await mountEdit()
      await wrapper.find('[data-testid="service-description"]').setValue('Runs the whole spine.')

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      const bar = wrapper.get('[data-testid="save-bar"]')
      expect(bar.get('[data-testid="compile-error"]').text()).toBe('Saved, but compiling failed: Something went wrong. Please try again.')
      expect(bar.get('[data-testid="view-service"]').attributes('href')).toBe('/authoring/services/northbound-express')
      expect(router.currentRoute.value.name).toBe('edit-service')
      expect(fieldValue(wrapper, 'service-description')).toBe('Runs the whole spine.')
      expect(formLocked(wrapper)).toBe(false)
      expect(hosts.toasts()).toEqual([])
    })

    it('reads "No changes" with Save disabled until a field changes, and again once it is changed back', async () => {
      const { wrapper } = await mountEdit()
      expect(saveStatus(wrapper)).toBe('No changes')
      expect(wrapper.get('[data-testid="submit"]').attributes('disabled')).toBeDefined()

      await wrapper.find('[data-testid="service-name"]').setValue('Southbound Express')
      expect(saveStatus(wrapper)).toBe('Unsaved changes · Draft kept in this browser')
      expect(wrapper.get('[data-testid="submit"]').attributes('disabled')).toBeUndefined()

      await wrapper.find('[data-testid="service-name"]').setValue('Northbound Express')
      expect(saveStatus(wrapper)).toBe('No changes')
      expect(wrapper.get('[data-testid="submit"]').attributes('disabled')).toBeDefined()
    })

    it('locks the form through "Saving…" and then "Compiling…"', async () => {
      const saving = deferred<Service>()
      vi.mocked(updateService).mockReturnValue(saving.promise)
      vi.mocked(compileService).mockReturnValue(new Promise(() => {}))
      const { wrapper, router } = await mountEdit()
      await wrapper.find('[data-testid="service-name"]').setValue('Southbound Express')

      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(saveStatus(wrapper)).toBe('Saving…')
      expect(formLocked(wrapper)).toBe(true)
      expect(wrapper.get('[data-testid="discard-edit"]').attributes('disabled')).toBeDefined()

      saving.resolve(savedService)
      await flushPromises()
      expect(saveStatus(wrapper)).toBe('Compiling…')
      expect(formLocked(wrapper)).toBe(true)
      expect(fieldValue(wrapper, 'service-name')).toBe('Southbound Express')
      expect(router.currentRoute.value.name).toBe('edit-service')
    })

    it('reads "Couldn\'t save" and keeps the changes when the save is refused', async () => {
      vi.mocked(updateService).mockRejectedValue(new ApiError('nope', 500))
      const { wrapper } = await mountEdit()
      await wrapper.find('[data-testid="service-name"]').setValue('Southbound Express')

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(saveStatus(wrapper)).toBe("Couldn't save · Your draft is still kept in this browser")
      expect(fieldValue(wrapper, 'service-name')).toBe('Southbound Express')
      expect(formLocked(wrapper)).toBe(false)
    })

    it('asks before discarding changes, and backing out keeps them', async () => {
      const { wrapper, router } = await mountEdit()
      await wrapper.find('[data-testid="service-name"]').setValue('Southbound Express')

      await wrapper.find('[data-testid="discard-edit"]').trigger('click')
      await flushPromises()
      expect(hosts.dialogOpen()).toBe(true)
      expect(hosts.dialog().text()).toContain('Discard your changes?')
      expect(hosts.confirmButton().text()).toBe('Discard changes')
      expect(hosts.cancelButton().text()).toBe('Keep editing')

      await hosts.cancelButton().trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('edit-service')
      expect(fieldValue(wrapper, 'service-name')).toBe('Southbound Express')
      expect(useDraftsStore().serviceDraft?.name).toBe('Southbound Express')
    })

    it('discards changes once confirmed and returns to the service', async () => {
      const { wrapper, router } = await mountEdit()
      await wrapper.find('[data-testid="service-name"]').setValue('Southbound Express')

      await wrapper.find('[data-testid="discard-edit"]').trigger('click')
      await flushPromises()
      await hosts.confirmButton().trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/authoring/services/northbound-express')
      expect(useDraftsStore().hasServiceDraft).toBe(false)
    })

    it('discards an unchanged edit without asking', async () => {
      const { wrapper, router } = await mountEdit()

      await wrapper.find('[data-testid="discard-edit"]').trigger('click')
      await flushPromises()

      expect(hosts.dialogOpen()).toBe(false)
      expect(router.currentRoute.value.path).toBe('/authoring/services/northbound-express')
    })

    it('asks for the route again when it cannot be recovered', async () => {
      vi.mocked(fetchServiceGraph).mockRejectedValue(new ApiError('no compiled graph', 404))
      const { wrapper } = await mountEdit()

      expect(wrapper.find('[data-testid="route-missing"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="submit"]').attributes('disabled')).toBeDefined()

      await wrapper.find('[data-testid="route-select"]').setValue('main-line')
      await flushPromises()

      expect(wrapper.find('[data-testid="route-missing"]').exists()).toBe(false)
    })

    it('discarding returns to the service and hands back the create draft the edit set aside', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop({ name: 'Half-authored', lat: 1, lng: 2, seq: 0 })
      const { wrapper, router } = await mountEdit()

      await wrapper.find('[data-testid="discard-edit"]').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/authoring/services/northbound-express')
      expect(drafts.editingServiceId).toBeNull()
      expect(drafts.serviceDraft?.stops.map((s) => s.name)).toEqual(['Half-authored'])
    })

    it('never shows a create draft in the slot while the service is loading', async () => {
      vi.mocked(fetchService).mockReturnValue(new Promise(() => {}))
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop({ name: 'Half-authored', lat: 1, lng: 2, seq: 0 })

      const { wrapper } = await mountEdit()

      const region = busyRegion(wrapper, 'draft-loading')
      expect(region.find('[data-testid="map-panel-skeleton"]').exists()).toBe(true)
      expect(visibleText(region)).toBe('')
      expect(wrapper.find('form').exists()).toBe(false)
    })

    it('shows a not-found state for a service that is not the caller\'s', async () => {
      vi.mocked(fetchService).mockRejectedValue(new ApiError('service not found', 404))
      const { wrapper } = await mountEdit('someone-elses')

      expect(wrapper.find('[data-testid="service-not-found"]').text()).toContain('someone-elses')
      expect(wrapper.find('form').exists()).toBe(false)
    })

    it('shows an error state when the service fails to load', async () => {
      vi.mocked(fetchService).mockRejectedValue(new Error('boom'))
      const { wrapper } = await mountEdit()

      expect(wrapper.find('[data-testid="service-error"]').exists()).toBe(true)
      expect(wrapper.find('form').exists()).toBe(false)
    })
  })
})
