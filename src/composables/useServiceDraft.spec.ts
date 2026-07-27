import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
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

import { PREVIEW_DEBOUNCE_MS, useServiceDraft } from './useServiceDraft'
import { fetchRoute, listRoutes, snapStops } from '../api/authoring/routes'
import { compileService, createService } from '../api/authoring/services'
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

const stubService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'rt1',
  name: 'Northbound Express',
  stops: [],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 },
  frequency_windows: [],
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

// Drives a draft to the point where canSubmit is true, which every submission
// case below starts from.
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
    it('creates the service, clears the draft, and compiles it', async () => {
      const draft = useServiceDraft()
      await submittable(draft)

      await draft.submit()

      expect(createService).toHaveBeenCalledWith(expect.objectContaining({
        route_slug: 'main-line',
        name: 'Northbound Express',
      }))
      expect(compileService).toHaveBeenCalledWith('northbound-express')
      expect(draft.submitted.value).toBe(true)
      expect(useDraftsStore().serviceDraft).toBeNull()
    })

    it('does nothing when the draft is not ready', async () => {
      const draft = useServiceDraft()
      await draft.start()

      await draft.submit()

      expect(createService).not.toHaveBeenCalled()
    })

    it('keeps the draft and reports the message when the write is refused', async () => {
      vi.mocked(createService).mockRejectedValue(new ApiError('POST /api/services failed: 422: nope', 422))
      const draft = useServiceDraft()
      await submittable(draft)

      await draft.submit()

      expect(draft.submitError.value).toContain('nope')
      expect(draft.submitted.value).toBe(false)
      expect(draft.stops.value).toHaveLength(2)
      expect(compileService).not.toHaveBeenCalled()
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
      expect(draft.submitError.value).toContain('rejected')
    })

    it('leaves no stop flagged when the refusal is not one it recognizes', async () => {
      vi.mocked(createService).mockRejectedValue(new ApiError('failed: 500', 500))
      const draft = useServiceDraft()
      await submittable(draft)

      await draft.submit()

      expect(draft.faultedStops.value.size).toBe(0)
      expect(draft.submitError.value).toContain('500')
    })

    it('opens a fresh draft and clears the last refusal when starting another', async () => {
      vi.mocked(createService).mockRejectedValue(new ApiError('failed: 422', 422))
      const draft = useServiceDraft()
      await submittable(draft)
      await draft.submit()

      draft.startAnother()

      expect(draft.submitError.value).toBe('')
      expect(draft.submitted.value).toBe(false)
      expect(draft.stops.value).toEqual([])
      expect(draft.preview.value).toBeNull()
      expect(draft.selectedRoute.value).toBeNull()
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
