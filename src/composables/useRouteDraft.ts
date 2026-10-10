import { computed, ref } from 'vue'
import { ApiError, isSessionExpiry } from '../api/authoring/client'
import { authoringFault, validationFaultsSentence } from '../api/authoringFault'
import { createRoute, fetchMyRoute, updateRoute } from '../api/authoring/routes'
import type { OwnedRoute, Route, RouteDependents, RouteInput, RouteMode } from '../api/authoring/types'
import type { Route as ScenarioRoute } from '../api/scenarios'
import {
  GeoJsonImportError,
  normaliseImportedGeoJson,
  routeLengthM,
  validateRouteInput,
} from '../routeGeometry'

export type LngLat = [number, number]

// How many lines are built on a route, curated and authored together, or
// null when the API did not say (a build without SPA-481).
export function usedByLines(dependents: RouteDependents | undefined): number | null {
  if (!dependents) return null
  return dependents.services + dependents.user_services
}

export function usedBySentence(dependents: RouteDependents | undefined): string {
  const lines = usedByLines(dependents)
  if (lines === null) return 'Use unknown'
  if (lines === 0) return 'Not used yet'
  return `Used by ${lines} ${lines === 1 ? 'line' : 'lines'}`
}

function sameCoordinates(a: number[][], b: number[][]): boolean {
  return a.length === b.length && a.every((pos, i) => pos[0] === b[i][0] && pos[1] === b[i][1])
}

function fingerprint(input: RouteInput): string {
  return JSON.stringify(input)
}

// With a slug the draft edits that route and saves with a PUT; without one it
// authors a new route. The shape is kept as a plain list of [lng, lat] the
// map editor to come can mutate through `coordinates` and setCoordinates;
// importing a file is just one way of filling it.
export function useRouteDraft(routeSlug?: string) {
  const name = ref('')
  const mode = ref<RouteMode>('rail')
  const bidirectional = ref(true)
  const description = ref('')
  const coordinates = ref<LngLat[]>([])

  const editing = ref<OwnedRoute | null>(null)
  const loading = ref(Boolean(routeSlug))
  const editNotFound = ref(false)
  const editLoadFailed = ref(false)

  const importError = ref('')
  const importNote = ref('')
  const nameTouched = ref(false)

  const savedFingerprint = ref<string | null>(null)
  const submitting = ref(false)
  const submitError = ref('')
  const createdSlug = ref<string | null>(null)
  const savedCount = ref(0)

  const ready = computed(() => !routeSlug || editing.value !== null)

  const inUseCount = computed(() => usedByLines(editing.value?.dependents))

  // The shape is frozen while lines sit on it: every stop of those lines is
  // a chainage along this route, and moving the route under them would put
  // the stops somewhere else. Name and details stay editable.
  const geometryLocked = computed(() => (inUseCount.value ?? 0) > 0)

  const geometryLockMessage = computed(() => {
    const lines = inUseCount.value ?? 0
    if (lines === 0) return ''
    return `Used by ${lines} ${lines === 1 ? 'line' : 'lines'} — the shape can't change while lines are built on it. Name and details can.`
  })

  const pointCount = computed(() => coordinates.value.length)
  const lengthM = computed(() => routeLengthM(coordinates.value))

  function touchName(): void {
    nameTouched.value = true
  }

  function setCoordinates(points: number[][]): void {
    if (geometryLocked.value) return
    coordinates.value = points.map(([lng, lat]) => [lng, lat])
    importError.value = ''
  }

  function importGeoJson(text: string, sourceName = 'the pasted GeoJSON'): boolean {
    if (geometryLocked.value) return false
    try {
      const points = normaliseImportedGeoJson(text)
      setCoordinates(points)
      importNote.value = `Imported ${points.length} ${points.length === 1 ? 'point' : 'points'} from ${sourceName}.`
      return true
    } catch (err) {
      importNote.value = ''
      importError.value = err instanceof GeoJsonImportError ? err.message : "Couldn't read that as GeoJSON."
      return false
    }
  }

  // The body as the API will read it. A locked shape is sent exactly as it
  // was read, never from `coordinates`, so nothing on this page can move a
  // route that lines are built on. Segments are physics the builder does not
  // edit, so they go back untouched while the shape they describe is
  // unchanged, and are dropped once it is not: the API wants one per span.
  function toInput(): RouteInput {
    const saved = editing.value
    const points = geometryLocked.value && saved ? saved.geometry.coordinates : coordinates.value
    const keepSegments = saved !== null && saved.segments.length > 0 && sameCoordinates(saved.geometry.coordinates, points)
    const trimmedDescription = description.value.trim()
    return {
      type: 'LineString',
      coordinates: points,
      properties: {
        name: name.value.trim(),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        mode: mode.value,
        bidirectional: bidirectional.value,
        ...(keepSegments ? { segments: saved.segments } : {}),
      },
    }
  }

  const faults = computed(() => validateRouteInput(toInput()))

  const hasContent = computed(() => name.value.trim() !== '' || coordinates.value.length > 0)

  // Read live, but a name that has never been typed into is not yet missing:
  // the first thing on the page should not be a complaint.
  const validationMessage = computed(() => {
    if (!hasContent.value) return ''
    const visible = faults.value.filter((fault) => fault.field !== 'name' || nameTouched.value)
    return validationFaultsSentence(visible) ?? ''
  })

  const hasChanges = computed(() => {
    if (savedFingerprint.value === null) return hasContent.value
    return fingerprint(toInput()) !== savedFingerprint.value
  })

  const canSave = computed(() => !submitting.value && faults.value.length === 0 && (editing.value === null || hasChanges.value))

  const mapRoutes = computed<ScenarioRoute[]>(() => {
    if (coordinates.value.length < 2) return []
    return [{
      id: editing.value?.id ?? 'draft',
      scenario_id: editing.value?.scenario_id ?? '',
      name: name.value || 'New route',
      mode: mode.value,
      geometry: { type: 'LineString', coordinates: coordinates.value },
      bidirectional: bidirectional.value,
    }]
  })

  function adopt(route: OwnedRoute): void {
    editing.value = route
    name.value = route.name
    mode.value = route.mode as RouteMode
    bidirectional.value = route.bidirectional
    description.value = route.description ?? ''
    coordinates.value = route.geometry.coordinates.map(([lng, lat]) => [lng, lat])
    nameTouched.value = true
    savedFingerprint.value = fingerprint(toInput())
  }

  async function start(): Promise<void> {
    if (!routeSlug) return
    try {
      adopt(await fetchMyRoute(routeSlug))
    } catch (err) {
      if (isSessionExpiry(err)) return
      if (err instanceof ApiError && err.status === 404) editNotFound.value = true
      else editLoadFailed.value = true
    }
    loading.value = false
  }

  // What a save gives back has no length or dependents; both are kept from
  // the read, since neither changes on a PUT the shape rule allows.
  function adoptSaved(saved: Route): void {
    const previous = editing.value
    adopt({
      ...saved,
      length_m: routeLengthM(saved.geometry.coordinates),
      dependents: previous?.dependents,
    })
  }

  async function submit(): Promise<void> {
    if (!canSave.value) return
    submitting.value = true
    submitError.value = ''
    try {
      const input = toInput()
      if (editing.value) {
        adoptSaved(await updateRoute(editing.value.slug, input))
        savedCount.value += 1
      } else {
        // The router reuses this page as the new route's editor, so the
        // draft becomes that route here: a second save must PUT it, not
        // POST a twin.
        const created = await createRoute(input)
        adoptSaved(created)
        createdSlug.value = created.slug
      }
    } catch (err) {
      submitError.value = authoringFault(err, 'route')
    } finally {
      submitting.value = false
    }
  }

  return {
    name,
    mode,
    bidirectional,
    description,
    coordinates,
    setCoordinates,
    importGeoJson,
    importError,
    importNote,
    touchName,
    editing,
    ready,
    loading,
    editNotFound,
    editLoadFailed,
    inUseCount,
    geometryLocked,
    geometryLockMessage,
    pointCount,
    lengthM,
    faults,
    validationMessage,
    hasChanges,
    canSave,
    submitting,
    submitError,
    createdSlug,
    savedCount,
    mapRoutes,
    start,
    submit,
  }
}
