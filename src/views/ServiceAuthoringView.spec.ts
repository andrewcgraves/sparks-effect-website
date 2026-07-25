import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type DOMWrapper } from '@vue/test-utils'
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
import { useDraftsStore } from '../stores/drafts'

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

function stopRowName(row: DOMWrapper<Element>): string {
  return (row.find('input[type="text"]').element as HTMLInputElement).value
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

  it('removes a stop', async () => {
    const wrapper = mountView()
    await flushPromises()
    await addStop(wrapper, 'A', 1, 1)
    await addStop(wrapper, 'B', 2, 2)

    await wrapper.find('[data-testid="stop-remove-0"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="stop-row"]')
    expect(rows).toHaveLength(1)
    expect(stopRowName(rows[0])).toBe('B')
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

  it('flags the offending stop row when a 422 names it', async () => {
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

    const rows = wrapper.findAll('[data-testid="stop-row"]')
    expect(rows[1].find('[data-testid="stop-submit-error"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="stop-submit-error"]').exists()).toBe(false)
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

  describe('placing stops by clicking the map', () => {
    function toggle(wrapper: ReturnType<typeof mountView>) {
      return wrapper.find('[data-testid="toggle-place-stops"]')
    }

    function mapStub(wrapper: ReturnType<typeof mountView>) {
      return wrapper.findComponent({ name: 'MapView' })
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

      expect(mapStub(wrapper).props('stopPlacementArmed')).toBe(false)

      await toggle(wrapper).trigger('click')
      expect(mapStub(wrapper).props('stopPlacementArmed')).toBe(true)

      await toggle(wrapper).trigger('click')
      expect(mapStub(wrapper).props('stopPlacementArmed')).toBe(false)
    })

    it('appends a stop at the clicked point, auto-named from a counter', async () => {
      const wrapper = mountView()
      await flushPromises()
      await toggle(wrapper).trigger('click')

      await clickMap(wrapper, 37.77, -122.41)
      await clickMap(wrapper, 37.33, -121.88)

      const stops = useDraftsStore().serviceDraft!.stops
      expect(stops).toEqual([
        { name: 'Stop 1', lat: 37.77, lng: -122.41, seq: 0 },
        { name: 'Stop 2', lat: 37.33, lng: -121.88, seq: 1 },
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
      await clickMap(wrapper, 38.0, -122.0)

      expect(stopNames(wrapper)).toEqual(['Stop 1', 'Stop 3'])
    })

    it('stays armed while the rest of the form is used', async () => {
      const wrapper = mountView()
      await flushPromises()
      await toggle(wrapper).trigger('click')

      await wrapper.find('[data-testid="service-name"]').setValue('Northbound Express')
      await wrapper.find('[data-testid="vehicle-dwell"]').setValue(45)

      expect(mapStub(wrapper).props('stopPlacementArmed')).toBe(true)
    })

    it('disarms on Escape', async () => {
      const wrapper = mountView()
      await flushPromises()
      await toggle(wrapper).trigger('click')

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()

      expect(mapStub(wrapper).props('stopPlacementArmed')).toBe(false)
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

  describe('dragging a stop pin to reposition it', () => {
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
        { name: 'SF', lat: 37.85, lng: -122.35, seq: 0 },
        { name: 'SJ', lat: 37.33, lng: -121.88, seq: 1 },
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
})
