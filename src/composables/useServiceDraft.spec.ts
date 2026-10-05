import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
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

import { PREVIEW_DEBOUNCE_MS, useServiceDraft } from './useServiceDraft'
import { fetchRoute, listRoutes, snapStops } from '../api/authoring/routes'
import {
  compileService,
  createService,
  fetchService,
  fetchServiceGraph,
  updateService,
} from '../api/authoring/services'
import { ApiError, SessionExpiredError } from '../api/authoring/client'
import { SESSION_EXPIRED_FAULT } from '../api/authoringFault'
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

const stubService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'rt1',
  name: 'Northbound Express',
  stops: [],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 },
  frequency_windows: [],
}

// What the API reads back: stops out of order and carrying the fields it
// derives, prose present, and the route named by id alone.
const savedService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'rt1',
  name: 'Northbound Express',
  subtext: 'Electrified · High-speed rail',
  description: 'Runs the spine.',
  stops: [
    { name: 'B', lat: 37.33, lng: -121.88, seq: 1, slug: 'northbound-express-b', chainage_m: 1000, offset_m: 3 },
    { name: 'A', lat: 37.77, lng: -122.41, seq: 0, slug: 'northbound-express-a', chainage_m: 0, offset_m: 2 },
  ],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1.1, deceleration_ms2: 1.2, dwell_s: 45 },
  frequency_windows: [{ start_time: '06:00', end_time: '22:00', headway_s: 900 }],
}

const savedGraph = { services: [], routes: [stubRoute] } as unknown as TransitGraph

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
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

type Draft = ReturnType<typeof useServiceDraft>

async function submittable(draft: Draft): Promise<void> {
  await draft.start()
  await draft.selectRoute('main-line')
  draft.addStop({ name: 'A', lat: 37.77, lng: -122.41 })
  draft.addStop({ name: 'B', lat: 37.33, lng: -121.88 })
  draft.name.value = 'Northbound Express'
  draft.addFrequencyWindow({ start_time: '06:00', end_time: '22:00', headway_s: 900 })
  await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)
  await flushPromises()
}

describe('useServiceDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.mocked(listRoutes).mockResolvedValue([stubRouteSummary])
    vi.mocked(fetchRoute).mockResolvedValue(stubRoute)
    vi.mocked(snapStops).mockResolvedValue(snapResponse())
    vi.mocked(createService).mockResolvedValue(stubService)
    vi.mocked(updateService).mockResolvedValue(savedService)
    vi.mocked(fetchService).mockResolvedValue(savedService)
    vi.mocked(fetchServiceGraph).mockResolvedValue(savedGraph)
    vi.mocked(compileService).mockResolvedValue({ id: 'job1', kind: 'compile_user_service', status: 'queued' } as Job)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('opening', () => {
    it('offers the route list once started', async () => {
      const draft = useServiceDraft()
      expect(draft.routesLoading.value).toBe(true)

      await draft.start()

      expect(draft.routes.value).toEqual([stubRouteSummary])
      expect(draft.routesLoading.value).toBe(false)
      expect(draft.routesError.value).toBe(false)
    })

    it('reports a route list that fails to load', async () => {
      vi.mocked(listRoutes).mockRejectedValue(new Error('boom'))
      const draft = useServiceDraft()

      await draft.start()

      expect(draft.routesError.value).toBe(true)
      expect(draft.routesLoading.value).toBe(false)
    })

    it('stays loading, not failed, when the route list is refused for an expired session', async () => {
      vi.mocked(listRoutes).mockRejectedValue(new SessionExpiredError('GET /api/routes failed: 401'))
      const draft = useServiceDraft()

      await draft.start()

      expect(draft.routesError.value).toBe(false)
      expect(draft.routesLoading.value).toBe(true)
    })

    it('opens an empty draft when there is nothing to resume', async () => {
      const draft = useServiceDraft()
      await draft.start()
      expect(draft.draft.value).not.toBeNull()
      expect(draft.stops.value).toEqual([])
    })

    // The store restores a persisted draft when the owner is adopted; starting
    // must not throw that away, or a reload would cost the author their work.
    it('resumes a draft that is already open rather than replacing it', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop({ name: 'Already here', lat: 1, lng: 2, seq: 0 })

      const draft = useServiceDraft()
      await draft.start()

      expect(draft.stops.value.map((s) => s.name)).toEqual(['Already here'])
    })

    it('draws the route a resumed draft already names, and previews its stops', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft({
        route_slug: 'main-line',
        name: '',
        stops: [{ name: 'A', lat: 37.77, lng: -122.41, seq: 0 }],
        vehicle: stubService.vehicle,
        frequency_windows: [],
      })

      const draft = useServiceDraft()
      await draft.start()
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)

      expect(draft.selectedRoute.value).toEqual(stubRoute)
      expect(snapStops).toHaveBeenCalledWith('main-line', [{ lat: 37.77, lng: -122.41 }])
    })

    it('keeps a route picked while the opening fetch was still in flight', async () => {
      const opening = deferred<Route>()
      const otherRoute: Route = { ...stubRoute, id: 'rt2', slug: 'other-line', name: 'Other Line' }
      vi.mocked(fetchRoute).mockReturnValueOnce(opening.promise).mockResolvedValueOnce(otherRoute)
      const drafts = useDraftsStore()
      drafts.startServiceDraft({ route_slug: 'main-line', name: '', stops: [], vehicle: stubService.vehicle, frequency_windows: [] })

      const draft = useServiceDraft()
      const started = draft.start()
      await flushPromises()
      await draft.selectRoute('other-line')
      opening.resolve(stubRoute)
      await started

      expect(draft.selectedRoute.value).toEqual(otherRoute)
    })

    // Abandoning an edit leaves it in the one slot. Adopting it here would
    // send it as a POST: a copy of a service that already exists.
    it('does not adopt an edit left open, and hands back the create draft it set aside', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop({ name: 'Mine', lat: 1, lng: 2, seq: 0 })
      drafts.startServiceDraft({ ...stubService, route_slug: 'main-line', stops: [] }, 'svc1')

      const draft = useServiceDraft()
      await draft.start()

      expect(draft.stops.value.map((s) => s.name)).toEqual(['Mine'])
      expect(drafts.editingServiceId).toBeNull()
    })
  })

  describe('editing an existing service', () => {
    it('opens with the service\'s stops, vehicle, windows and prose', async () => {
      const draft = useServiceDraft('northbound-express')
      await draft.start()

      expect(fetchService).toHaveBeenCalledWith('northbound-express')
      expect(draft.ready.value).toBe(true)
      expect(draft.editing.value).toEqual(savedService)
      expect(draft.draft.value).toEqual({
        route_slug: 'main-line',
        name: 'Northbound Express',
        subtext: 'Electrified · High-speed rail',
        description: 'Runs the spine.',
        stops: [
          { id: expect.any(String), name: 'A', lat: 37.77, lng: -122.41, seq: 0 },
          { id: expect.any(String), name: 'B', lat: 37.33, lng: -121.88, seq: 1 },
        ],
        vehicle: { max_speed_kmh: 320, acceleration_ms2: 1.1, deceleration_ms2: 1.2, dwell_s: 45 },
        frequency_windows: [{ id: expect.any(String), start_time: '06:00', end_time: '22:00', headway_s: 900 }],
      })
      expect(useDraftsStore().editingServiceId).toBe('svc1')
    })

    it('recovers the route the service runs on and draws it', async () => {
      const draft = useServiceDraft('northbound-express')
      await draft.start()

      expect(fetchServiceGraph).toHaveBeenCalledWith('northbound-express')
      expect(draft.routeSlug.value).toBe('main-line')
      expect(draft.routeMissing.value).toBe(false)
      expect(draft.selectedRoute.value).toEqual(stubRoute)
    })

    it('previews where the stops it opened with snap to', async () => {
      const draft = useServiceDraft('northbound-express')
      await draft.start()
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)
      await flushPromises()

      expect(snapStops).toHaveBeenCalledWith('main-line', [
        { lat: 37.77, lng: -122.41 },
        { lat: 37.33, lng: -121.88 },
      ])
      expect(draft.canSubmit.value).toBe(true)
    })

    it('opens without a route when the graph cannot say which, and waits for one to be picked', async () => {
      vi.mocked(fetchServiceGraph).mockRejectedValue(new ApiError('no compiled graph', 404))
      const draft = useServiceDraft('northbound-express')
      await draft.start()

      expect(draft.routeSlug.value).toBe('')
      expect(draft.routeMissing.value).toBe(true)
      expect(draft.canSubmit.value).toBe(false)
      expect(draft.stops.value).toHaveLength(2)

      await draft.selectRoute('main-line')

      expect(draft.routeMissing.value).toBe(false)
    })

    it('saves with a PUT to the service, never a POST, and recompiles it', async () => {
      const draft = useServiceDraft('northbound-express')
      await draft.start()
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)
      await flushPromises()
      draft.description.value = 'Runs the whole spine.'

      await draft.submit()

      expect(updateService).toHaveBeenCalledWith('northbound-express', expect.objectContaining({
        route_slug: 'main-line',
        description: 'Runs the whole spine.',
        stops: [
          { name: 'A', lat: 37.77, lng: -122.41, seq: 0 },
          { name: 'B', lat: 37.33, lng: -121.88, seq: 1 },
        ],
        frequency_windows: [{ start_time: '06:00', end_time: '22:00', headway_s: 900 }],
      }))
      expect(createService).not.toHaveBeenCalled()
      expect(compileService).toHaveBeenCalledWith('northbound-express', expect.any(Object))
      expect(draft.createdSlug.value).toBeNull()
    })

    it('keeps the edit and says why when the save is refused', async () => {
      vi.mocked(updateService).mockRejectedValue(new ApiError('PUT /api/services/northbound-express failed: 422: nope', 422))
      const draft = useServiceDraft('northbound-express')
      await draft.start()
      draft.name.value = 'Renamed'

      await draft.submit()

      expect(draft.submitError.value).toBe("Some of this service's details weren't accepted. Check them and try again.")
      expect(draft.hasChanges.value).toBe(true)
      expect(useDraftsStore().editingServiceId).toBe('svc1')
    })

    // The saved edit stays on the form until the page is left, so the recompile
    // can be waited on, or fail, in front of it.
    it('sets aside a create draft in progress and hands it back once the edit is saved and left', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop({ name: 'Half-authored', lat: 1, lng: 2, seq: 0 })

      const draft = useServiceDraft('northbound-express')
      await draft.start()
      expect(draft.stops.value.map((s) => s.name)).toEqual(['A', 'B'])
      draft.name.value = 'Renamed'

      await draft.submit()
      expect(drafts.editingServiceId).toBe('svc1')
      draft.dispose()

      expect(drafts.editingServiceId).toBeNull()
      expect(drafts.serviceDraft?.stops.map((s) => s.name)).toEqual(['Half-authored'])
    })

    it('shows no draft at all while the service is still loading, not the create draft in the slot', async () => {
      const loading = deferred<Service>()
      vi.mocked(fetchService).mockReturnValue(loading.promise)
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop({ name: 'Half-authored', lat: 1, lng: 2, seq: 0 })

      const draft = useServiceDraft('northbound-express')
      const started = draft.start()
      await flushPromises()

      expect(draft.ready.value).toBe(false)
      expect(draft.draft.value).toBeNull()
      expect(draft.stops.value).toEqual([])

      loading.resolve(savedService)
      await started

      expect(draft.stops.value.map((s) => s.name)).toEqual(['A', 'B'])
    })

    // The edit is persisted, so a reload must bring the author's unsaved
    // changes back rather than reseeding over them from the server.
    it('resumes an edit of the same service rather than reseeding it', async () => {
      const first = useServiceDraft('northbound-express')
      await first.start()
      first.name.value = 'Renamed'
      first.dispose()

      const second = useServiceDraft('northbound-express')
      await second.start()

      expect(second.name.value).toBe('Renamed')
    })

    it('replaces an edit of another service that was left open', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft({ ...stubService, route_slug: 'main-line', name: 'Other', stops: [] }, 'svc-other')

      const draft = useServiceDraft('northbound-express')
      await draft.start()

      expect(draft.name.value).toBe('Northbound Express')
      expect(drafts.editingServiceId).toBe('svc1')
    })

    it('reports a service that is not the caller\'s, and opens nothing', async () => {
      vi.mocked(fetchService).mockRejectedValue(new ApiError('service not found', 404))
      const draft = useServiceDraft('someone-elses')
      await draft.start()

      expect(draft.editNotFound.value).toBe(true)
      expect(draft.editLoadFailed.value).toBe(false)
      expect(draft.ready.value).toBe(false)
      expect(listRoutes).not.toHaveBeenCalled()
      expect(useDraftsStore().hasServiceDraft).toBe(false)
    })

    it('reports a service that fails to load for another reason', async () => {
      vi.mocked(fetchService).mockRejectedValue(new Error('boom'))
      const draft = useServiceDraft('northbound-express')
      await draft.start()

      expect(draft.editLoadFailed.value).toBe(true)
      expect(draft.editNotFound.value).toBe(false)
    })

    it('reports no load failure when the service is refused for an expired session', async () => {
      vi.mocked(fetchService).mockRejectedValue(new SessionExpiredError('GET /api/services/northbound-express failed: 401'))
      const draft = useServiceDraft('northbound-express')
      await draft.start()

      expect(draft.editLoadFailed.value).toBe(false)
      expect(draft.editNotFound.value).toBe(false)
    })

    it('discarding the edit hands the slot back to the create draft it set aside', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop({ name: 'Half-authored', lat: 1, lng: 2, seq: 0 })
      const draft = useServiceDraft('northbound-express')
      await draft.start()

      draft.discardEdit()

      expect(drafts.editingServiceId).toBeNull()
      expect(drafts.serviceDraft?.stops.map((s) => s.name)).toEqual(['Half-authored'])
    })

    it('discarding before the edit ever opened leaves a create draft in the slot alone', async () => {
      vi.mocked(fetchService).mockRejectedValue(new Error('boom'))
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop({ name: 'Half-authored', lat: 1, lng: 2, seq: 0 })
      const draft = useServiceDraft('northbound-express')
      await draft.start()

      draft.discardEdit()

      expect(drafts.serviceDraft?.stops.map((s) => s.name)).toEqual(['Half-authored'])
    })
  })

  describe('telling whether the draft has changes', () => {
    async function openedEdit(): Promise<Draft> {
      const draft = useServiceDraft('northbound-express')
      await draft.start()
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)
      await flushPromises()
      return draft
    }

    it('reads an untouched edit as unchanged, and will not save it', async () => {
      const draft = await openedEdit()

      expect(draft.hasChanges.value).toBe(false)
      expect(draft.canSubmit.value).toBe(true)
      expect(draft.canSave.value).toBe(false)
    })

    it('reads a changed field as a change, and a reverted one as none', async () => {
      const draft = await openedEdit()

      draft.name.value = 'Southbound Express'
      expect(draft.hasChanges.value).toBe(true)
      expect(draft.canSave.value).toBe(true)

      draft.name.value = 'Northbound Express'
      expect(draft.hasChanges.value).toBe(false)
    })

    it.each([
      ['the route', (d: Draft) => { d.routeSlug.value = 'branch-line' }],
      ['the subtext', (d: Draft) => { d.subtext.value = 'Diesel' }],
      ['the description', (d: Draft) => { d.description.value = 'Runs the branch.' }],
      ['a stop name', (d: Draft) => d.updateStop(0, { name: 'Aye' })],
      ['a stop latitude', (d: Draft) => d.updateStop(0, { lat: 37.7 })],
      ['a stop longitude', (d: Draft) => d.updateStop(1, { lng: -121.8 })],
      ['the stop order', (d: Draft) => d.moveStop(0, 1)],
      ['the vehicle', (d: Draft) => { d.dwellS.value = 60 }],
      ['a frequency window', (d: Draft) => d.addFrequencyWindow({ start_time: '22:00', end_time: '23:00', headway_s: 1800 })],
    ])('counts a change to %s', async (_, change) => {
      const draft = await openedEdit()

      change(draft)

      expect(draft.hasChanges.value).toBe(true)
    })

    it('ignores row ids, seq and the stop-number counter', async () => {
      const draft = await openedEdit()

      draft.moveStop(0, 1)
      draft.moveStop(1, -1)
      draft.addStopAt({ lat: 37.5, lng: -122 })
      draft.removeStop(2)

      expect(draft.hasChanges.value).toBe(false)
    })

    it('compares a resumed edit with the saved service, not with what was resumed', async () => {
      const first = await openedEdit()
      first.name.value = 'Renamed'
      first.dispose()

      const second = await openedEdit()

      expect(second.hasChanges.value).toBe(true)
      second.name.value = 'Northbound Express'
      expect(second.hasChanges.value).toBe(false)
    })

    it('reads a create as changed once a name, route or stop is set, and not before', async () => {
      const draft = useServiceDraft()
      await draft.start()
      expect(draft.hasChanges.value).toBe(false)

      draft.addFrequencyWindow({ start_time: '06:00', end_time: '22:00', headway_s: 900 })
      expect(draft.hasChanges.value).toBe(false)

      draft.name.value = 'Northbound Express'
      expect(draft.hasChanges.value).toBe(true)
      draft.name.value = ''

      await draft.selectRoute('main-line')
      expect(draft.hasChanges.value).toBe(true)
      draft.routeSlug.value = ''

      draft.addStop({ name: 'A', lat: 1, lng: 1 })
      expect(draft.hasChanges.value).toBe(true)
    })

    it('saves a create without any further gate than readiness', async () => {
      const draft = useServiceDraft()
      await submittable(draft)

      expect(draft.canSave.value).toBe(true)
    })

    it('does not save an untouched edit', async () => {
      const draft = await openedEdit()

      await draft.submit()

      expect(updateService).not.toHaveBeenCalled()
    })

    it('keeps the saved edit on the form, unchanged, when the recompile fails', async () => {
      vi.mocked(compileService).mockRejectedValue(new Error('compile exploded'))
      const draft = await openedEdit()
      draft.description.value = 'Runs the whole spine.'

      await draft.submit()

      expect(draft.compileError.value).not.toBe('')
      expect(draft.ready.value).toBe(true)
      expect(draft.description.value).toBe('Runs the whole spine.')
      expect(draft.hasChanges.value).toBe(false)
      expect(draft.canSave.value).toBe(false)
    })

    it('ends an edit with no changes left when the page is left', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop({ name: 'Half-authored', lat: 1, lng: 2, seq: 0 })
      const draft = await openedEdit()

      draft.dispose()

      expect(drafts.editingServiceId).toBeNull()
      expect(drafts.serviceDraft?.stops.map((s) => s.name)).toEqual(['Half-authored'])
    })

    it('keeps an edit with changes when the page is left', async () => {
      const draft = await openedEdit()
      draft.name.value = 'Renamed'

      draft.dispose()

      expect(useDraftsStore().editingServiceId).toBe('svc1')
      expect(useDraftsStore().serviceDraft?.name).toBe('Renamed')
    })
  })

  describe('prose', () => {
    it('writes the subtext and description through to the stored draft', async () => {
      const draft = useServiceDraft()
      await draft.start()

      draft.subtext.value = 'Electrified · Light rail'
      draft.description.value = 'Crosstown.'

      expect(useDraftsStore().serviceDraft).toEqual(expect.objectContaining({
        subtext: 'Electrified · Light rail',
        description: 'Crosstown.',
      }))
    })

    it('reads a draft without prose as empty prose', async () => {
      const draft = useServiceDraft()
      await draft.start()

      expect(draft.subtext.value).toBe('')
      expect(draft.description.value).toBe('')
    })
  })

  describe('stops', () => {
    it('keeps seq equal to position as stops are added and reordered', async () => {
      const draft = useServiceDraft()
      await draft.start()

      draft.addStop({ name: 'A', lat: 1, lng: 1 })
      draft.addStop({ name: 'B', lat: 2, lng: 2 })
      draft.addStop({ name: 'C', lat: 3, lng: 3 })
      draft.moveStop(0, 1)

      expect(draft.stops.value.map((s) => s.name)).toEqual(['B', 'A', 'C'])
      expect(draft.stops.value.map((s) => s.seq)).toEqual([0, 1, 2])
    })

    it('renumbers after a removal', async () => {
      const draft = useServiceDraft()
      await draft.start()
      draft.addStop({ name: 'A', lat: 1, lng: 1 })
      draft.addStop({ name: 'B', lat: 2, lng: 2 })

      draft.removeStop(0)

      expect(draft.stops.value.map((s) => s.seq)).toEqual([0])
    })

    it('ignores a stop with no name', async () => {
      const draft = useServiceDraft()
      await draft.start()

      draft.addStop({ name: '   ', lat: 1, lng: 1 })

      expect(draft.stops.value).toEqual([])
    })

    // Stop slugs are minted from these names server-side, so a number must
    // never be issued twice — deleting a stop does not free its number.
    it('never reissues an auto stop number', async () => {
      const draft = useServiceDraft()
      await draft.start()

      draft.addStopAt({ lat: 1, lng: 1 })
      draft.addStopAt({ lat: 2, lng: 2 })
      draft.removeStop(1)
      draft.addStopAt({ lat: 3, lng: 3 })

      expect(draft.stops.value.map((s) => s.name)).toEqual(['Stop 1', 'Stop 3'])
    })
  })

  describe('the snap preview', () => {
    it('does not fire until the author stops typing', async () => {
      const draft = useServiceDraft()
      await draft.start()
      await draft.selectRoute('main-line')
      draft.addStop({ name: 'A', lat: 37.77, lng: -122.41 })

      expect(snapStops).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)

      expect(snapStops).toHaveBeenCalledWith('main-line', [{ lat: 37.77, lng: -122.41 }])
    })

    it('coalesces a burst of edits into one request', async () => {
      const draft = useServiceDraft()
      await draft.start()
      await draft.selectRoute('main-line')
      draft.addStop({ name: 'A', lat: 37.77, lng: -122.41 })
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS / 2)
      draft.addStop({ name: 'B', lat: 37.33, lng: -121.88 })

      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)

      expect(snapStops).toHaveBeenCalledTimes(1)
      expect(snapStops).toHaveBeenCalledWith('main-line', [
        { lat: 37.77, lng: -122.41 },
        { lat: 37.33, lng: -121.88 },
      ])
    })

    // A drag rewrites coordinates on every pointer move; snapping each one puts
    // a burst of requests behind a single gesture for answers nobody reads.
    it('waits for the drop rather than snapping mid-drag', async () => {
      const draft = useServiceDraft()
      await draft.start()
      await draft.selectRoute('main-line')
      draft.addStop({ name: 'A', lat: 37.77, lng: -122.41 })
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)
      vi.mocked(snapStops).mockClear()

      draft.dragStop(0, { lat: 38, lng: -122 })
      draft.dragStop(0, { lat: 38.1, lng: -122.1 })
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)
      expect(snapStops).not.toHaveBeenCalled()

      draft.dropStop(0, { lat: 38.2, lng: -122.2 })
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)

      expect(snapStops).toHaveBeenCalledTimes(1)
      expect(snapStops).toHaveBeenCalledWith('main-line', [{ lat: 38.2, lng: -122.2 }])
    })

    it('does not snap a draft with no route or no stops', async () => {
      const draft = useServiceDraft()
      await draft.start()

      draft.addStop({ name: 'A', lat: 1, lng: 1 })
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)

      expect(snapStops).not.toHaveBeenCalled()
    })

    it('reports a preview that fails without losing the stops', async () => {
      vi.mocked(snapStops).mockRejectedValue(new Error('boom'))
      const draft = useServiceDraft()
      await draft.start()
      await draft.selectRoute('main-line')
      draft.addStop({ name: 'A', lat: 37.77, lng: -122.41 })

      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)
      await flushPromises()

      expect(draft.previewError.value).toBe(true)
      expect(draft.previewLoading.value).toBe(false)
      expect(draft.stops.value).toHaveLength(1)
    })

    it('pairs each stop with where it snapped to', async () => {
      const draft = useServiceDraft()
      await submittable(draft)

      expect(draft.stopPreviewPairs.value).toEqual([
        { id: '0', raw: { lat: 37.77, lng: -122.41 }, snapped: { lat: 37.77, lng: -122.41 }, offRoute: false },
        { id: '1', raw: { lat: 37.33, lng: -121.88 }, snapped: { lat: 37.33, lng: -121.88 }, offRoute: false },
      ])
    })

    it('names the along-the-line order when it disagrees with the authored one', async () => {
      vi.mocked(snapStops).mockResolvedValue(snapResponse({ order_is_consistent: false, chainage_order: [1, 0] }))
      const draft = useServiceDraft()
      await submittable(draft)

      expect(draft.orderWarning.value).toContain('B → A')
    })

    it('drops the preview when the route changes underneath it', async () => {
      const draft = useServiceDraft()
      await submittable(draft)
      expect(draft.preview.value).not.toBeNull()

      await draft.selectRoute('other-line')

      expect(draft.preview.value).toBeNull()
    })
  })

  describe('readiness to submit', () => {
    it('is ready once route, two stops, a name, and a window are set', async () => {
      const draft = useServiceDraft()
      await submittable(draft)
      expect(draft.canSubmit.value).toBe(true)
    })

    it.each([
      ['no name', (d: Draft) => { d.name.value = '  ' }],
      ['one stop', (d: Draft) => { d.removeStop(1) }],
      ['no route', (d: Draft) => { d.routeSlug.value = '' }],
      ['an impossible vehicle', (d: Draft) => { d.maxSpeedKmh.value = 0 }],
    ])('is not ready with %s', async (_label, break_) => {
      const draft = useServiceDraft()
      await submittable(draft)

      break_(draft)

      expect(draft.canSubmit.value).toBe(false)
    })

    // A service with no prose is a legitimate service, and the server agrees.
    it('is ready with neither a subtext nor a description', async () => {
      const draft = useServiceDraft()
      await submittable(draft)

      draft.subtext.value = ''
      draft.description.value = ''

      expect(draft.canSubmit.value).toBe(true)
    })

    it('is not ready with no frequency window', async () => {
      const draft = useServiceDraft()
      await submittable(draft)

      draft.removeFrequencyWindow(0)

      expect(draft.canSubmit.value).toBe(false)
    })

    it('is not ready while the preview says a stop is off the route', async () => {
      const offRoute = snapResponse()
      offRoute.stops[1] = { ...offRoute.stops[1], off_route: true, offset_m: 620 }
      vi.mocked(snapStops).mockResolvedValue(offRoute)
      const draft = useServiceDraft()

      await submittable(draft)

      expect(draft.canSubmit.value).toBe(false)
    })

    it('is not ready while the preview says the order disagrees', async () => {
      vi.mocked(snapStops).mockResolvedValue(snapResponse({ order_is_consistent: false, chainage_order: [1, 0] }))
      const draft = useServiceDraft()

      await submittable(draft)

      expect(draft.canSubmit.value).toBe(false)
    })
  })

  describe('submitting', () => {
    it('creates the service, clears the draft, and hands over its slug without compiling it', async () => {
      const draft = useServiceDraft()
      await submittable(draft)

      await draft.submit()

      expect(vi.mocked(createService).mock.calls[0][0]).toStrictEqual({
        route_slug: 'main-line',
        name: 'Northbound Express',
        subtext: undefined,
        description: undefined,
        vehicle: { max_speed_kmh: 80, acceleration_ms2: 1, deceleration_ms2: 1.2, dwell_s: 30 },
        stops: [
          { name: 'A', lat: 37.77, lng: -122.41, seq: 0 },
          { name: 'B', lat: 37.33, lng: -121.88, seq: 1 },
        ],
        frequency_windows: [{ start_time: '06:00', end_time: '22:00', headway_s: 900 }],
      })
      expect(compileService).not.toHaveBeenCalled()
      expect(draft.createdSlug.value).toBe('northbound-express')
      expect(useDraftsStore().serviceDraft).toBeNull()
    })

    it('sends the subtext and description with the service', async () => {
      const draft = useServiceDraft()
      await submittable(draft)
      draft.subtext.value = 'Electrified · High-speed rail'
      draft.description.value = 'Runs the spine.\n\nStops at every town.'

      await draft.submit()

      expect(createService).toHaveBeenCalledWith(expect.objectContaining({
        subtext: 'Electrified · High-speed rail',
        description: 'Runs the spine.\n\nStops at every town.',
      }))
    })

    it('does nothing when the draft is not ready', async () => {
      const draft = useServiceDraft()
      await draft.start()

      await draft.submit()

      expect(createService).not.toHaveBeenCalled()
    })

    it('keeps the draft and says why when the write is refused', async () => {
      vi.mocked(createService).mockRejectedValue(new ApiError('POST /api/services failed: 422: nope', 422))
      const draft = useServiceDraft()
      await submittable(draft)

      await draft.submit()

      expect(draft.submitError.value).toBe("Some of this service's details weren't accepted. Check them and try again.")
      expect(draft.createdSlug.value).toBeNull()
      expect(draft.stops.value).toHaveLength(2)
      expect(compileService).not.toHaveBeenCalled()
    })

    it('words a mid-save session expiry plainly, with no raw 401, and keeps the draft', async () => {
      vi.mocked(createService).mockRejectedValue(new SessionExpiredError('POST /api/services failed: 401: unauthorized'))
      const draft = useServiceDraft()
      await submittable(draft)

      await draft.submit()

      expect(draft.submitError.value).toBe(SESSION_EXPIRED_FAULT)
      expect(draft.stops.value).toHaveLength(2)
    })

    it('attributes a stop-placement refusal to the rows it names', async () => {
      vi.mocked(createService).mockRejectedValue(
        new ApiError('POST /api/services failed: 422: rejected', 422, 'stop_placement', {
          fault: 'off_route',
          route_slug: 'main-line',
          threshold_m: 500,
          stops: [{ seq: 1, name: 'B', slug: 'b', chainage_m: 12000, offset_m: 620 }],
        }),
      )
      const draft = useServiceDraft()
      await submittable(draft)

      await draft.submit()

      expect([...draft.faultedStops.value.keys()]).toEqual([1])
      expect(draft.stopFaultMessage(draft.faultedStops.value.get(1)!)).toContain('620')
    })

    // The flags name positions in the list that was submitted. Once that list
    // changes those positions mean different stops, so a flag left in place
    // would slide onto an innocent row.
    it('drops the stop flags once the author edits the stop list', async () => {
      vi.mocked(createService).mockRejectedValue(
        new ApiError('POST /api/services failed: 422: rejected', 422, 'stop_placement', {
          fault: 'off_route',
          route_slug: 'main-line',
          threshold_m: 500,
          stops: [{ seq: 1, name: 'B', slug: 'b', chainage_m: 12000, offset_m: 620 }],
        }),
      )
      const draft = useServiceDraft()
      await submittable(draft)
      await draft.submit()
      expect(draft.faultedStops.value.size).toBe(1)

      draft.removeStop(0)
      // The watcher is pre-flush, so it clears before the next render — which
      // is what stops a stale flag ever being painted.
      await nextTick()

      expect(draft.faultedStops.value.size).toBe(0)
      // The banner is the record of what happened, so it stays.
      expect(draft.submitError.value).toBe('Stop "B" is too far from the route. Move it onto the line and save again.')
    })

    it('leaves no stop flagged when the refusal is not one it recognizes', async () => {
      vi.mocked(createService).mockRejectedValue(new ApiError('failed: 500', 500))
      const draft = useServiceDraft()
      await submittable(draft)

      await draft.submit()

      expect(draft.faultedStops.value.size).toBe(0)
      expect(draft.submitError.value).toBe("Couldn't reach the server. Your draft is saved; try again.")
    })
  })

  describe('disposing', () => {
    it('drops a preview that had not fired yet', async () => {
      const draft = useServiceDraft()
      await draft.start()
      await draft.selectRoute('main-line')
      draft.addStop({ name: 'A', lat: 37.77, lng: -122.41 })

      draft.dispose()
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)

      expect(snapStops).not.toHaveBeenCalled()
    })

    it('stops watching, so a later edit schedules nothing', async () => {
      const draft = useServiceDraft()
      await draft.start()
      await draft.selectRoute('main-line')

      draft.dispose()
      draft.addStop({ name: 'A', lat: 37.77, lng: -122.41 })
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)

      expect(snapStops).not.toHaveBeenCalled()
    })

    // The draft is the one piece of authoring state no API can hand back, so
    // leaving the page must not discard it.
    it('leaves the draft itself intact', async () => {
      const draft = useServiceDraft()
      await draft.start()
      draft.addStop({ name: 'A', lat: 1, lng: 1 })

      draft.dispose()

      expect(useDraftsStore().serviceDraft?.stops).toHaveLength(1)
    })
  })
})
