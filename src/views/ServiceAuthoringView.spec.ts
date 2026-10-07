import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type DOMWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Job, Route, RouteSummary, SnapStopsResponse, Service, TransitGraph } from '../api/authoring/types'

vi.mock('../api/authoring/routes', () => ({
  listRoutes: vi.fn(),
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
import { breadcrumbTrail } from '../test/breadcrumbs'
import { busyRegion, visibleText } from '../test/loading'
import { listRoutes, fetchRoute, snapStops } from '../api/authoring/routes'
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

function mountView() {
  return mount(ServiceAuthoringView, {
    global: { stubs: { MapView: true } },
  })
}

async function addStop(wrapper: ReturnType<typeof mountView>, name: string, lat: number, lng: number) {
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

async function mountWithTwoStops() {
  const wrapper = mountView()
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

  it('loads the route list and offers it in the picker', async () => {
    const wrapper = mountView()
    await flushPromises()
    const options = wrapper.findAll('[data-testid="route-select"] option')
    expect(options.some((o) => o.text().includes('Main Line'))).toBe(true)
  })

  it('shows a route-picker skeleton, not loading copy, while the routes load', async () => {
    vi.mocked(listRoutes).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    await flushPromises()
    const region = busyRegion(wrapper, 'routes-loading')
    expect(region.find('[data-testid="field-skeleton"]').exists()).toBe(true)
    expect(visibleText(region)).toBe('')
  })

  it('shows an error state when routes fail to load', async () => {
    vi.mocked(listRoutes).mockRejectedValue(new Error('boom'))
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

  it('reorders stops with the up/down controls', async () => {
    const wrapper = mountView()
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)
    await addStop(wrapper, 'B', 2, 2)

    await wrapper.find('[data-testid="stop-down-0"]').trigger('click')
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

      await wrapper.get('[data-testid="stop-down-1"]').trigger('click')

      const charlieRow = wrapper.findAll('[data-testid="stop-row"]').find((row) => {
        const lat = row.get('[data-testid^="stop-edit-lat-"]').element as HTMLInputElement
        return Number(lat.value) === 3
      })
      expect(charlieRow?.element.contains(nameInput)).toBe(true)
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

    await wrapper.find('[data-testid="stop-remove-0"]').trigger('click')
    await flushPromises()
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
    ['the stop that took its place', 0, 'stop-remove-0'],
    ['the stop before it, when it was last', 1, 'stop-remove-0'],
  ])('moves focus to %s once a stop is removed', async (_, removed, focused) => {
    const wrapper = mount(ServiceAuthoringView, { global: { stubs: { MapView: true } }, attachTo: document.body })
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)
    await addStop(wrapper, 'B', 2, 2)

    const trigger = wrapper.get(`[data-testid="stop-remove-${removed}"]`)
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()
    await hosts.confirmButton().trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get(`[data-testid="${focused}"]`).element)
    wrapper.unmount()
  })

  it('moves focus to the new-stop name once the last stop is removed', async () => {
    const wrapper = mount(ServiceAuthoringView, { global: { stubs: { MapView: true } }, attachTo: document.body })
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)

    const trigger = wrapper.get('[data-testid="stop-remove-0"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()
    await hosts.confirmButton().trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-name"]').element)
    wrapper.unmount()
  })

  it('keeps a stop when removing it is backed out of', async () => {
    const wrapper = mountView()
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)

    await wrapper.find('[data-testid="stop-remove-0"]').trigger('click')
    await flushPromises()
    await hosts.cancelButton().trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="stop-row"]')).toHaveLength(1)
    expect(hosts.toasts()).toEqual([])
  })

  it('edits a stop lat/lng inline via updateStop', async () => {
    const wrapper = mountView()
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)

    const latInput = wrapper.find('[data-testid="stop-edit-lat-0"]')
    await latInput.setValue(40)
    await latInput.trigger('change')

    expect(useDraftsStore().serviceDraft?.stops[0].lat).toBe(40)
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

      await toggle(wrapper).trigger('click')
      expect(mapStub(wrapper).props('placementArmed')).toBe(true)

      await toggle(wrapper).trigger('click')
      expect(mapStub(wrapper).props('placementArmed')).toBe(false)
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
      await wrapper.find('[data-testid="stop-remove-1"]').trigger('click')
      await flushPromises()
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

      expect(wrapper.get('[data-testid="vehicle-preset-label"]').text()).toBe('Custom')
    })

    it('reads the saved vehicle as its preset when it equals one', async () => {
      vi.mocked(fetchService).mockResolvedValue({
        ...savedService,
        vehicle: { max_speed_kmh: 320, acceleration_ms2: 0.5, deceleration_ms2: 0.65, dwell_s: 90 },
      })
      const { wrapper } = await mountEdit()

      expect(wrapper.get('[data-testid="vehicle-preset-label"]').text()).toBe('High-speed rail')
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
