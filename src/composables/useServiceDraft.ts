import { computed, ref, watch, type WatchStopHandle } from 'vue'
import { useDraftsStore } from '../stores/drafts'
import { useCompileJob } from './useCompileJob'
import { ApiError, stopPlacementFault } from '../api/authoring/client'
import { fetchRoute, listRoutes, snapStops } from '../api/authoring/routes'
import { compileService, createService } from '../api/authoring/services'
import type {
  FaultedStop,
  Route,
  RouteSummary,
  SnapCoord,
  SnapStopsResponse,
  StopPlacementFault,
  VehicleParams,
} from '../api/authoring'
import type { Route as ScenarioRoute } from '../api/scenarios'
import type { StopPreviewPair } from './useStopPreviewLayer'

// Live preview trades a little latency for not hammering the snap endpoint on
// every keystroke; 400ms is long enough to coalesce a burst of edits and short
// enough that the preview still feels immediate.
export const PREVIEW_DEBOUNCE_MS = 400

/**
 * One authored Service, from the first empty draft to the compiled graph.
 *
 * This is the whole edit lifecycle in one place: which route the draft is
 * against, its stops and their numbering, the snap preview that tells the
 * author whether those stops are placeable, whether the draft is complete
 * enough to submit, and the submission itself. Those rules used to be split
 * between the drafts store and the authoring view, which meant a single
 * lifecycle — add a stop, see it snapped, find out it is off-route, move it —
 * was answered by two modules with no single owner of the sequencing.
 *
 * What stays outside: the drafts store remains the persistence layer, so a
 * draft still survives a reload and still cannot be read by a second account
 * on the same browser; the api modules remain the transport; and the view keeps
 * its own form inputs and rendering. This owns the rules between them.
 *
 * start() and dispose() are explicit rather than lifecycle hooks so the module
 * can be driven directly by its tests, which is the point of having it.
 */
export function useServiceDraft() {
  const drafts = useDraftsStore()
  const {
    compiling,
    compileError,
    result: compiledGraph,
    trigger: triggerCompile,
    reset: resetCompile,
  } = useCompileJob(compileService)

  const routes = ref<RouteSummary[]>([])
  const routesLoading = ref(true)
  const routesError = ref(false)

  const selectedRoute = ref<Route | null>(null)

  const preview = ref<SnapStopsResponse | null>(null)
  const previewLoading = ref(false)
  const previewError = ref(false)

  const submitted = ref(false)
  const submitting = ref(false)
  const submitError = ref('')
  const submitFault = ref<StopPlacementFault | null>(null)

  let previewTimer: ReturnType<typeof setTimeout> | null = null
  // Read only by schedulePreview, never rendered, so it stays a plain binding.
  let draggingStop = false
  let unwatchDraft: WatchStopHandle | null = null

  const draft = computed(() => drafts.serviceDraft)
  const stops = computed(() => draft.value?.stops ?? [])
  const frequencyWindows = computed(() => draft.value?.frequency_windows ?? [])

  // Writable bindings the view can v-model. Each writes through to the store,
  // which is what keeps a keystroke persisted without the view knowing that
  // persistence exists.
  const routeSlug = computed({
    get: () => draft.value?.route_slug ?? '',
    set: (value: string) => drafts.patchServiceDraft({ route_slug: value }),
  })

  const name = computed({
    get: () => draft.value?.name ?? '',
    set: (value: string) => drafts.patchServiceDraft({ name: value }),
  })

  function patchVehicle(patch: Partial<VehicleParams>): void {
    if (!draft.value) return
    drafts.patchServiceDraft({ vehicle: { ...draft.value.vehicle, ...patch } })
  }

  function vehicleField(field: keyof VehicleParams) {
    return computed({
      get: () => draft.value?.vehicle[field] ?? 0,
      set: (value: number) => patchVehicle({ [field]: value }),
    })
  }

  const maxSpeedKmh = vehicleField('max_speed_kmh')
  const accelerationMs2 = vehicleField('acceleration_ms2')
  const decelerationMs2 = vehicleField('deceleration_ms2')
  const dwellS = vehicleField('dwell_s')

  const mapRoutes = computed<ScenarioRoute[]>(() => {
    const route = selectedRoute.value
    if (!route) return []
    return [{
      id: route.id,
      scenario_id: route.scenario_id ?? '',
      name: route.name,
      mode: route.mode,
      geometry: route.geometry,
      bidirectional: route.bidirectional,
    }]
  })

  const stopPreviewPairs = computed<StopPreviewPair[]>(() =>
    stops.value.map((stop, index) => {
      const snapped = preview.value?.stops[index]
      return {
        id: String(index),
        raw: { lat: stop.lat, lng: stop.lng },
        snapped: snapped ? snapped.snapped : null,
        offRoute: snapped?.off_route ?? false,
      }
    }),
  )

  // The preview endpoint reports only whether the order disagrees, not which
  // pair — the write path's 422 names the pair, but by the time that fires the
  // user should already have fixed it here. Rendering the along-the-line order
  // lets them compare it to what they authored and reorder by hand.
  const orderWarning = computed<string | null>(() => {
    if (!preview.value || preview.value.order_is_consistent) return null
    const alongLine = preview.value.chainage_order
      .map((i) => stops.value[i]?.name)
      .filter((stopName): stopName is string => !!stopName)
    return `Authored order doesn't match the route's direction. Along the line: ${alongLine.join(' → ')}.`
  })

  // Preview is advisory, so a preview that has not run does not block a submit;
  // one that has run and found a fault does. The server re-checks either way.
  const canSubmit = computed(() => {
    const current = draft.value
    if (!current || submitting.value) return false
    if (!current.route_slug || !current.name.trim()) return false
    if (current.stops.length < 2) return false
    if (
      current.vehicle.max_speed_kmh <= 0 ||
      current.vehicle.acceleration_ms2 <= 0 ||
      current.vehicle.deceleration_ms2 <= 0
    ) {
      return false
    }
    if (current.frequency_windows.length === 0) return false
    if (preview.value) {
      if (preview.value.stops.some((stop) => stop.off_route)) return false
      if (!preview.value.order_is_consistent) return false
    }
    return true
  })

  // The write-time 422 is the backstop behind live preview — preview already
  // catches off-route and order problems before submit, so this only fires when
  // the route changed underneath the draft or preview hasn't run yet.
  //
  // Keyed by seq, which is the position the stop was submitted under, and which
  // the drafts store keeps equal to its row index (see renumber). That is the
  // one field that survives the round trip: a rejected write stores nothing, so
  // the slug it reports is one the client has never seen, and the name is
  // whatever the author may since have retyped.
  const faultedStops = computed<Map<number, FaultedStop>>(
    () => new Map(submitFault.value?.stops.map((stop) => [stop.seq, stop]) ?? []),
  )

  function stopFaultMessage(stop: FaultedStop): string {
    return submitFault.value?.fault === 'off_route'
      ? `Rejected: ${Math.round(stop.offset_m)}m off the route`
      : 'Rejected: out of order along the route'
  }

  function schedulePreview(): void {
    if (previewTimer) clearTimeout(previewTimer)
    // A drag rewrites a stop's coordinates on every pointer move. Snapping each
    // one would put a burst of requests behind a single gesture for answers
    // nobody reads, so the preview waits for the drop.
    if (draggingStop) return
    previewTimer = setTimeout(() => void runPreview(), PREVIEW_DEBOUNCE_MS)
  }

  async function runPreview(): Promise<void> {
    const current = draft.value
    if (!current || !current.route_slug || current.stops.length === 0) {
      preview.value = null
      return
    }
    previewLoading.value = true
    previewError.value = false
    try {
      preview.value = await snapStops(
        current.route_slug,
        current.stops.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
      )
    } catch {
      previewError.value = true
    } finally {
      previewLoading.value = false
    }
  }

  /** Loads the route picker and opens a draft, resuming a persisted one if there is one. */
  async function start(): Promise<void> {
    if (!drafts.hasServiceDraft) drafts.startServiceDraft()
    unwatchDraft ??= watch(
      () => [draft.value?.route_slug, draft.value?.stops],
      () => schedulePreview(),
    )
    try {
      routes.value = await listRoutes()
    } catch {
      routesError.value = true
    } finally {
      routesLoading.value = false
    }
  }

  /** Drops the pending preview and stops watching. The draft itself is persisted, so it survives. */
  function dispose(): void {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = null
    unwatchDraft?.()
    unwatchDraft = null
  }

  async function selectRoute(slug: string): Promise<void> {
    routeSlug.value = slug
    selectedRoute.value = null
    preview.value = null
    if (!slug) return
    try {
      selectedRoute.value = await fetchRoute(slug)
    } catch {
      // Geometry is a best-effort map preview; the picker itself still works
      // without it, so a fetch failure here is silently swallowed.
    }
    schedulePreview()
  }

  function addStop(stop: { name: string; lat: number; lng: number }): void {
    if (!stop.name.trim()) return
    drafts.addStop({ name: stop.name.trim(), lat: stop.lat, lng: stop.lng, seq: 0 })
  }

  // The clicked point is stored raw, not snapped: clicking is less precise than
  // typing, so the existing off-route feedback is what tells the author they
  // missed the line.
  function addStopAt(coord: SnapCoord): void {
    if (!draft.value) return
    drafts.addStop({ name: `Stop ${drafts.takeStopNumber()}`, lat: coord.lat, lng: coord.lng, seq: 0 })
  }

  // Dragging writes lat/lng and nothing else, leaving names, ordering and the
  // stop counter untouched.
  function dragStop(index: number, coord: SnapCoord): void {
    draggingStop = true
    drafts.updateStop(index, coord)
  }

  function dropStop(index: number, coord: SnapCoord): void {
    draggingStop = false
    drafts.updateStop(index, coord)
  }

  async function submit(): Promise<void> {
    const current = draft.value
    if (!current || !canSubmit.value) return
    submitting.value = true
    submitError.value = ''
    submitFault.value = null
    try {
      const created = await createService(current)
      drafts.clearServiceDraft()
      submitted.value = true
      await triggerCompile(created.slug)
    } catch (err) {
      submitError.value = err instanceof ApiError ? err.message : 'Something went wrong creating the service.'
      // Null for anything this build cannot attribute to specific rows, which
      // leaves the banner as the whole of the feedback.
      submitFault.value = stopPlacementFault(err)
    } finally {
      submitting.value = false
    }
  }

  /** Clears the finished service away and opens an empty draft in its place. */
  function startAnother(): void {
    submitted.value = false
    submitError.value = ''
    submitFault.value = null
    resetCompile()
    preview.value = null
    selectedRoute.value = null
    drafts.startServiceDraft()
  }

  return {
    // Draft state
    draft,
    stops,
    frequencyWindows,
    routeSlug,
    name,
    maxSpeedKmh,
    accelerationMs2,
    decelerationMs2,
    dwellS,
    // Routes
    routes,
    routesLoading,
    routesError,
    selectedRoute,
    mapRoutes,
    selectRoute,
    // Stops
    addStop,
    addStopAt,
    updateStop: drafts.updateStop,
    removeStop: drafts.removeStop,
    moveStop: drafts.moveStop,
    dragStop,
    dropStop,
    // Frequency windows
    addFrequencyWindow: drafts.addFrequencyWindow,
    removeFrequencyWindow: drafts.removeFrequencyWindow,
    // Preview
    preview,
    previewLoading,
    previewError,
    stopPreviewPairs,
    orderWarning,
    // Submission
    canSubmit,
    submitting,
    submitted,
    submitError,
    faultedStops,
    stopFaultMessage,
    submit,
    startAnother,
    // Compile
    compiling,
    compileError,
    compiledGraph,
    // Lifecycle
    start,
    dispose,
  }
}
