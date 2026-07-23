import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Job, Route, RouteSummary, SnapStopsResponse, Service } from '../api/authoring/types'

vi.mock('../api/authoring/routes', () => ({
  listRoutes: vi.fn(),
  fetchRoute: vi.fn(),
  snapStops: vi.fn(),
}))
vi.mock('../api/authoring/services', () => ({
  createService: vi.fn(),
  compileService: vi.fn(),
}))

import ServiceAuthoringView from './ServiceAuthoringView.vue'
import { listRoutes, fetchRoute, snapStops } from '../api/authoring/routes'
import { createService, compileService } from '../api/authoring/services'
import { ApiError } from '../api/authoring/client'

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

describe('ServiceAuthoringView', () => {
  beforeEach(() => {
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
    expect(rows[0].text()).toContain('SF')
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
    expect(rows[0].text()).toContain('B')
    expect(rows[1].text()).toContain('A')
  })

  it('removes a stop', async () => {
    const wrapper = mountView()
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)
    await addStop(wrapper, 'B', 2, 2)

    await wrapper.find('[data-testid="stop-remove-0"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="stop-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('B')
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

  it('creates the service, triggers a compile, polls the job, and shows the compiled result', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'job1',
        kind: 'compile_user_service',
        status: 'succeeded',
        result: {
          services: [{ service_id: 'svc1', edges: [{ from_slug: 'sf', to_slug: 'sj', seconds: 90 }], wait_secs: 30 }],
        },
      }),
    } as Response)

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

    expect(createService).toHaveBeenCalledWith(expect.objectContaining({ route_slug: 'main-line', name: 'Northbound Express' }))
    expect(compileService).toHaveBeenCalledWith('northbound-express')
    expect(wrapper.find('[data-testid="compile-result"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="compile-result"]').text()).toContain('1 service')
    const edgeRows = wrapper.findAll('[data-testid="compile-edge-row"]')
    expect(edgeRows[0].text()).toContain('sf')
    expect(edgeRows[0].text()).toContain('sj')
  })

  it('shows the 422 message from the API when creation is rejected', async () => {
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

    expect(wrapper.find('[data-testid="submit-error"]').text()).toContain('620 m from route')
    expect(compileService).not.toHaveBeenCalled()
  })
})
