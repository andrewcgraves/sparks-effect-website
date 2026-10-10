import { computed, ref, watch, type WatchStopHandle } from 'vue'
import { useDraftsStore, type ServiceDraft } from '../stores/drafts'
import { useCompileJob } from './useCompileJob'
import { latestAttempt } from './latestAttempt'
import { ApiError, isSessionExpiry, stopPlacementFault } from '../api/authoring/client'
import { authoringFault } from '../api/authoringFault'
import { fetchMyRoutes, fetchRoute, listRoutes, snapStops } from '../api/authoring/routes'
import {
  compileService,
  createService,
  fetchService,
  fetchServiceGraph,
  updateService,
} from '../api/authoring/services'
import type {
  FaultedStop,
  Route,
  RouteSummary,
  Service,
  ServiceInput,
  SnapCoord,
  SnappedStopResult,
  SnapStopsResponse,
  StopPlacementFault,
  StopPlacementFaultKind,
  VehicleParams,
} from '../api/authoring'
import type { Route as ScenarioRoute } from '../api/scenarios'
import type { StopPreviewPair } from './useStopPreviewLayer'

export const PREVIEW_DEBOUNCE_MS = 400

// What the vehicle reads as before the gate opens, so the editor always has
// four numbers to bind to; the gate also hides the form, so it is never saved.
const NO_VEHICLE: VehicleParams = { max_speed_kmh: 0, acceleration_ms2: 0, deceleration_ms2: 0, dwell_s: 0 }

// A service read back in the shape the form edits. The fields the server
// derives are left behind — stop slugs, chainage and offset are re-minted from
// the stops on every write — and each stop and frequency window gets a
// client-only id so the editor can key its rows. That id is not part of the
// body create and update stringify, so serviceInputFromDraft takes it back off.
function serviceInputFrom(service: Service, routeSlug: string): ServiceDraft {
  return {
    route_slug: routeSlug,
    name: service.name,
    subtext: service.subtext ?? '',
    description: service.description ?? '',
    stops: [...service.stops]
      .sort((a, b) => a.seq - b.seq)
      .map((stop, seq) => ({
        id: crypto.randomUUID(),
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        seq,
      })),
    vehicle: {
      max_speed_kmh: service.vehicle.max_speed_kmh,
      acceleration_ms2: service.vehicle.acceleration_ms2,
      deceleration_ms2: service.vehicle.deceleration_ms2,
      dwell_s: service.vehicle.dwell_s,
    },
    frequency_windows: service.frequency_windows.map((window) => ({
      id: crypto.randomUUID(),
      start_time: window.start_time,
      end_time: window.end_time,
      headway_s: window.headway_s,
    })),
  }
}

function serviceInputFromDraft(draft: ServiceDraft): ServiceInput {
  const { route_slug, name, subtext, description, vehicle, stops, frequency_windows } = draft
  return {
    route_slug,
    name,
    subtext,
    description,
    vehicle,
    stops: stops.map(({ name, lat, lng, seq }) => ({ name, lat, lng, seq })),
    frequency_windows: frequency_windows.map(({ start_time, end_time, headway_s }) => ({
      start_time,
      end_time,
      headway_s,
    })),
  }
}

// What the author can see and change, and nothing the editor keeps for
// itself: row ids, seq and the stop-number counter move without the service
// moving, so they are left out of the comparison that decides whether a draft
// differs from what is saved.
function fingerprint(draft: ServiceDraft): string {
  return JSON.stringify([
    draft.route_slug,
    draft.name,
    draft.subtext ?? '',
    draft.description ?? '',
    draft.stops.map(({ name, lat, lng }) => [name, lat, lng]),
    [
      draft.vehicle.max_speed_kmh,
      draft.vehicle.acceleration_ms2,
      draft.vehicle.deceleration_ms2,
      draft.vehicle.dwell_s,
    ],
    draft.frequency_windows.map(({ start_time, end_time, headway_s }) => [start_time, end_time, headway_s]),
  ])
}

// A service reads its route back by id but is written by route slug, and no
// route listing carries ids. The compiled graph read is the one that carries
// the service's route whole, loaded by id at read time rather than frozen into
// the compile, so the slug comes from there. Empty when there is no graph to
// ask, which leaves the author to pick the route again.
async function routeSlugOf(service: Service): Promise<string> {
  try {
    const graph = await fetchServiceGraph(service.slug)
    return graph.routes?.find((route) => route.id === service.route_id)?.slug ?? ''
  } catch {
    return ''
  }
}

// With a slug the draft edits that service and saves with a PUT; without one
// it authors a new service.
export function useServiceDraft(serviceSlug?: string) {
  const drafts = useDraftsStore()
  const {
    compiling,
    compileError,
    result: compiledGraph,
    trigger: triggerCompile,
  } = useCompileJob(compileService)

  const ownedRoutes = ref<RouteSummary[]>([])
  const routes = ref<RouteSummary[]>([])
  const routesLoading = ref(true)
  const routesError = ref(false)

  const selectedRoute = ref<Route | null>(null)

  const preview = ref<SnapStopsResponse | null>(null)
  // The stops the preview was asked about, in the order it was asked. Its
  // answers are positional, and the list can be reordered while a request is
  // out or before the next one is scheduled; reading them through these ids
  // keeps each answer on the stop it is about. The coordinates are kept too,
  // because a stop that has moved since may sit somewhere else along the line.
  const previewAsked = ref<{ id: string; lat: number; lng: number }[]>([])
  const previewLoading = ref(false)
  const previewError = ref(false)

  const editing = ref<Service | null>(null)
  const editNotFound = ref(false)
  const editLoadFailed = ref(false)

  const savedFingerprint = ref<string | null>(null)

  const createdSlug = ref<string | null>(null)
  const submitting = ref(false)
  const submitError = ref('')
  const submitFault = ref<StopPlacementFault | null>(null)

  let previewTimer: ReturnType<typeof setTimeout> | null = null
  // Read only by schedulePreview, never rendered, so it stays a plain binding.
  let draggingStop = false
  let unwatchDraft: WatchStopHandle | null = null
  const routeLoads = latestAttempt()
  const previewRuns = latestAttempt()

  // The store keeps one service draft, and it is not always this page's: the
  // create draft an edit is opening over, or the one a finished edit handed the
  // slot back to. Everything here reads the draft through this gate, so a draft
  // belonging to the other kind of write can neither reach the form nor be sent.
  const ready = computed(() => {
    if (!drafts.hasServiceDraft) return false
    if (!serviceSlug) return drafts.editingServiceId === null
    return editing.value !== null && drafts.editingServiceId === editing.value.id
  })

  const draft = computed(() => (ready.value ? drafts.serviceDraft : null))
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

  const subtext = computed({
    get: () => draft.value?.subtext ?? '',
    set: (value: string) => drafts.patchServiceDraft({ subtext: value }),
  })

  const description = computed({
    get: () => draft.value?.description ?? '',
    set: (value: string) => drafts.patchServiceDraft({ description: value }),
  })

  // Read and written whole: a preset replaces all four values in one write,
  // and the fields that make up a vehicle are the editor's concern.
  const vehicle = computed({
    get: () => draft.value?.vehicle ?? NO_VEHICLE,
    set: (value: VehicleParams) => drafts.patchServiceDraft({ vehicle: value }),
  })

  // An edit whose route could not be recovered opens without one, and cannot be
  // saved until the author picks it again.
  const routeMissing = computed(() => editing.value !== null && ready.value && !routeSlug.value)

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

  const stopSnaps = computed<Map<string, SnappedStopResult>>(() => {
    const answers = preview.value?.stops ?? []
    return new Map(answers.map((answer, index) => [previewAsked.value[index]?.id, answer]))
  })

  const stopPreviewPairs = computed<StopPreviewPair[]>(() =>
    stops.value.map((stop, index) => {
      const snapped = stopSnaps.value.get(stop.id)
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
    const byId = new Map(stops.value.map((stop) => [stop.id, stop.name]))
    const alongLine = preview.value.chainage_order
      .map((i) => byId.get(previewAsked.value[i]?.id))
      .filter((stopName): stopName is string => !!stopName)
    return `Authored order doesn't match the route's direction. Along the route: ${alongLine.join(' → ')}.`
  })

  // The along-the-line order as stop ids, or null when the preview has no
  // complaint or was taken of different stops than the draft now holds — a stop
  // added or removed since, or one moved, which may have changed where along
  // the line it falls. Applying it is idempotent, which matters because the
  // warning that offers it outlives the reorder until the next preview lands.
  const routeOrder = computed<string[] | null>(() => {
    if (!preview.value || preview.value.order_is_consistent) return null
    const asked = new Map(previewAsked.value.map((stop) => [stop.id, stop]))
    const unmoved = stops.value.every((stop) => {
      const then = asked.get(stop.id)
      return then !== undefined && then.lat === stop.lat && then.lng === stop.lng
    })
    if (!unmoved || asked.size !== stops.value.length) return null
    return preview.value.chainage_order.map((i) => previewAsked.value[i].id)
  })

  const canPutInRouteOrder = computed(() => {
    const order = routeOrder.value
    return order !== null && order.some((id, index) => stops.value[index]?.id !== id)
  })

  function putInRouteOrder(): void {
    if (canPutInRouteOrder.value) drafts.reorderStops(routeOrder.value!)
  }

  // For a line that runs its route backwards: chainage order is monotonic, not
  // ascending, so the route order above can be the wrong way round for it.
  function reverseStops(): void {
    drafts.reorderStops(stops.value.map((stop) => stop.id).reverse())
  }

  function moveStopTo(id: string, to: number): void {
    const ids = stops.value.map((stop) => stop.id)
    const from = ids.indexOf(id)
    if (from === -1 || to < 0 || to >= ids.length || from === to) return
    ids.splice(from, 1)
    ids.splice(to, 0, id)
    drafts.reorderStops(ids)
  }

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
      current.vehicle.deceleration_ms2 <= 0 ||
      current.vehicle.dwell_s < 0
    ) {
      return false
    }
    if (current.frequency_windows.length === 0) return false
    if (preview.value) {
      if (current.stops.some((stop) => stopSnaps.value.get(stop.id)?.off_route)) return false
      if (!preview.value.order_is_consistent) return false
    }
    return true
  })

  const hasChanges = computed(() => {
    const current = draft.value
    if (!current) return false
    // A create has nothing saved to differ from, so it counts once started.
    if (savedFingerprint.value === null) return !!(current.name.trim() || current.route_slug || current.stops.length)
    return fingerprint(current) !== savedFingerprint.value
  })

  // Saving an unchanged edit would recompile the service for nothing.
  const canSave = computed(() => canSubmit.value && (!serviceSlug || hasChanges.value))

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

  // Keyed by kind so a kind added to StopPlacementFaultKind fails to compile
  // until it has a sentence, rather than silently falling into someone else's.
  const STOP_FAULT_MESSAGES: Record<StopPlacementFaultKind, (stop: FaultedStop) => string> = {
    off_route: (stop) => `Rejected: ${Math.round(stop.offset_m)}m off the route`,
    chainage_order: () => 'Rejected: out of order along the route',
  }

  function stopFaultMessage(stop: FaultedStop): string {
    const fault = submitFault.value
    return fault ? STOP_FAULT_MESSAGES[fault.fault](stop) : ''
  }

  function schedulePreview(): void {
    if (previewTimer) clearTimeout(previewTimer)
    // A drag rewrites a stop's coordinates on every pointer move. Snapping each
    // one would put a burst of requests behind a single gesture for answers
    // nobody reads, so the preview waits for the drop.
    if (draggingStop) return
    previewTimer = setTimeout(() => void runPreview(), PREVIEW_DEBOUNCE_MS)
  }

  // Numbered because previews overlap whenever the network is slower than the
  // debounce: only the newest answer describes the stops on screen, and only
  // the newest request says whether one is still being waited on.
  async function runPreview(): Promise<void> {
    const attempt = previewRuns.begin()
    const current = draft.value
    if (!current || !current.route_slug || current.stops.length === 0) {
      preview.value = null
      previewLoading.value = false
      return
    }
    previewLoading.value = true
    previewError.value = false
    const asked = current.stops.map(({ id, lat, lng }) => ({ id, lat, lng }))
    try {
      const answer = await snapStops(
        current.route_slug,
        asked.map(({ lat, lng }) => ({ lat, lng })),
      )
      if (!previewRuns.isCurrent(attempt)) return
      previewAsked.value = asked
      preview.value = answer
    } catch {
      if (previewRuns.isCurrent(attempt)) previewError.value = true
    } finally {
      if (previewRuns.isCurrent(attempt)) previewLoading.value = false
    }
  }

  // A draft still open for editing was abandoned when its author came here
  // instead. Clearing it hands the slot back to any create draft it set aside,
  // rather than this page adopting an edit and saving it as a second service.
  function openCreate(): boolean {
    if (drafts.editingServiceId !== null) drafts.clearServiceDraft()
    if (!drafts.hasServiceDraft) drafts.startServiceDraft()
    return true
  }

  async function openEdit(slug: string): Promise<boolean> {
    let service: Service
    try {
      service = await fetchService(slug)
    } catch (err) {
      // An expired session is already on its way to sign-in; don't flash a failure.
      if (isSessionExpiry(err)) return false
      if (err instanceof ApiError && err.status === 404) editNotFound.value = true
      else editLoadFailed.value = true
      return false
    }
    // Asked even when resuming, because a resumed draft says what the author
    // last had, not what is saved, and the changes are measured against the
    // saved route.
    const saved = serviceInputFrom(service, await routeSlugOf(service))
    savedFingerprint.value = fingerprint(saved)
    editing.value = service
    // Resumed rather than reseeded when the slot already holds this very edit,
    // which is what carries unsaved changes across a reload.
    if (drafts.editingServiceId !== service.id) drafts.startServiceDraft(saved, service.id)
    return true
  }

  async function start(): Promise<void> {
    // Watching before the draft is opened, so a seeded edit gets its preview
    // the same way a typed change would.
    unwatchDraft ??= watch(
      () => [draft.value?.route_slug, draft.value?.stops],
      () => {
        // The fault names positions in the stop list that was submitted. Edit
        // that list and those positions mean different stops, so the flags stop
        // being true — delete the stop above a rejected one and the flag would
        // otherwise slide onto an innocent row. The banner stays: it is the
        // record of what happened, not a claim about a row.
        submitFault.value = null
        schedulePreview()
      },
    )
    const opened = serviceSlug ? await openEdit(serviceSlug) : openCreate()
    if (!opened) return
    await Promise.all([loadRoutes(), loadRoute(routeSlug.value)])
  }

  // The author's own routes and the curated ones are two lists from two
  // endpoints, shown as two groups. Either list alone is a picker worth
  // having, so one failing only loses its group; both failing is an error.
  async function loadRoutes(): Promise<void> {
    const [owned, curated] = await Promise.allSettled([fetchMyRoutes(), listRoutes()])
    if ((owned.status === 'rejected' && isSessionExpiry(owned.reason))
      || (curated.status === 'rejected' && isSessionExpiry(curated.reason))) {
      return
    }
    if (owned.status === 'fulfilled') ownedRoutes.value = owned.value
    if (curated.status === 'fulfilled') routes.value = curated.value
    routesError.value = owned.status === 'rejected' && curated.status === 'rejected'
    routesLoading.value = false
  }

  // The draft itself is persisted, so it survives — unless it is an edit with
  // nothing left in it that the service doesn't already say, which is how a
  // saved edit ends, and how an edit opened and left untouched hands the slot
  // back to any create draft it set aside.
  function dispose(): void {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = null
    unwatchDraft?.()
    unwatchDraft = null
    if (editing.value && ready.value && !hasChanges.value) drafts.clearServiceDraft()
  }

  async function selectRoute(slug: string): Promise<void> {
    routeSlug.value = slug
    await loadRoute(slug)
  }

  // Also run on opening, so a draft that already names a route — resumed after
  // a reload, or seeded from a service — draws it rather than an empty map.
  //
  // Numbered because the fetch made on opening races the picker: a route
  // chosen while it is in flight must not have its geometry land on the map.
  async function loadRoute(slug: string): Promise<void> {
    const attempt = routeLoads.begin()
    selectedRoute.value = null
    // A preview still out was asked against the route being left.
    previewRuns.supersede()
    previewLoading.value = false
    preview.value = null
    if (!slug) return
    try {
      const route = await fetchRoute(slug)
      if (routeLoads.isCurrent(attempt)) selectedRoute.value = route
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
    if (!current || !canSave.value) return
    submitting.value = true
    submitError.value = ''
    submitFault.value = null
    try {
      // Branches on the slot rather than on which page is open: a draft seeded
      // from an existing service goes back as a PUT, and can never go out as a
      // POST that mints a second service. The gate on `draft` is what keeps
      // `editing` set whenever the slot names an edit.
      const isEdit = drafts.editingServiceId !== null
      const saved = isEdit
        ? await updateService(editing.value!.slug, serviceInputFromDraft(current))
        : await createService(serviceInputFromDraft(current))
      // A new service has never compiled, and its own page compiles it when
      // the graph read 404s, so a create is finished the moment it is stored.
      if (!isEdit) {
        drafts.clearServiceDraft()
        createdSlug.value = saved.slug
        return
      }
      // An edit is not: that page reads the last compile that succeeded, which
      // predates the edit, so the recompile has to happen here, with the form
      // still in front of the author in case it fails. What was sent is now
      // what is saved, so the draft stays and reads as unchanged; dispose ends
      // it once the page is left.
      editing.value = saved
      savedFingerprint.value = fingerprint(current)
      // The save is done; from here the wait is the compile's, which takes
      // over the busy state in the same tick.
      submitting.value = false
      await triggerCompile(saved.slug)
    } catch (err) {
      submitError.value = authoringFault(err)
      // Null for anything this build cannot attribute to specific rows, which
      // leaves the banner as the whole of the feedback.
      submitFault.value = stopPlacementFault(err)
    } finally {
      submitting.value = false
    }
  }

  // Guarded by the gate, so giving up an edit can never clear a create draft
  // that happens to be in the slot.
  function discardEdit(): void {
    if (editing.value && ready.value) drafts.clearServiceDraft()
  }

  return {
    ready,
    editing,
    editNotFound,
    editLoadFailed,
    routeMissing,
    draft,
    stops,
    frequencyWindows,
    routeSlug,
    name,
    subtext,
    description,
    vehicle,
    ownedRoutes,
    routes,
    routesLoading,
    routesError,
    selectedRoute,
    mapRoutes,
    selectRoute,
    addStop,
    addStopAt,
    updateStop: drafts.updateStop,
    removeStop: drafts.removeStop,
    moveStop: drafts.moveStop,
    moveStopTo,
    putInRouteOrder,
    reverseStops,
    canPutInRouteOrder,
    dragStop,
    dropStop,
    addFrequencyWindow: drafts.addFrequencyWindow,
    removeFrequencyWindow: drafts.removeFrequencyWindow,
    preview,
    previewLoading,
    previewError,
    stopSnaps,
    stopPreviewPairs,
    orderWarning,
    canSubmit,
    hasChanges,
    canSave,
    submitting,
    createdSlug,
    submitError,
    faultedStops,
    stopFaultMessage,
    submit,
    discardEdit,
    compiling,
    compileError,
    compiledGraph,
    start,
    dispose,
  }
}
