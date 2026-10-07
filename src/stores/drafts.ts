import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  BOARDING_WAIT_POLICIES,
  type BoardingWaitOverride,
  type BoardingWaitPolicy,
  type FrequencyWindow,
  type InterchangePair,
  type ScenarioInput,
  type Stop,
  type StopIdentity,
  type VehicleParams,
} from '../api/authoring/types'
import { useAuthStore } from './auth'
import { readJson, removeKey, writeJson } from './storage'

const DRAFTS_STORAGE_KEY_PREFIX = 'sparks-effect.drafts'

export function draftsStorageKey(userId: string): string {
  return `${DRAFTS_STORAGE_KEY_PREFIX}.${userId}`
}

const DEFAULT_VEHICLE: VehicleParams = {
  max_speed_kmh: 80,
  acceleration_ms2: 1.0,
  deceleration_ms2: 1.2,
  dwell_s: 30,
}

export interface DraftStop {
  id: string
  name: string
  lat: number
  lng: number
  seq: number
}

export interface DraftFrequencyWindow {
  id: string
  start_time: string
  end_time: string
  headway_s: number
}

export interface ServiceDraft {
  route_slug: string
  name: string
  subtext?: string
  description?: string
  stops: DraftStop[]
  vehicle: VehicleParams
  frequency_windows: DraftFrequencyWindow[]
}

type Unidentified<T extends { id: string }> = Omit<T, 'id'> & { id?: unknown }

type ServiceDraftSeed = Omit<ServiceDraft, 'stops' | 'frequency_windows'> & {
  stops: Unidentified<DraftStop>[]
  frequency_windows: Unidentified<DraftFrequencyWindow>[]
}

function emptyServiceDraft(): ServiceDraft {
  return { route_slug: '', name: '', stops: [], vehicle: { ...DEFAULT_VEHICLE }, frequency_windows: [] }
}

function emptyScenarioDraft(): ScenarioInput {
  return { name: '', description: '', service_ids: [], interchange_pairs: [], boarding_wait: null }
}

const AUTO_STOP_NAME = /^Stop (\d+)$/

function renumber(stops: DraftStop[]): DraftStop[] {
  return stops.map((stop, index) => ({ ...stop, seq: index }))
}

function backfillRowId<T extends { id?: unknown }>(row: T): Omit<T, 'id'> & { id: string } {
  const id = typeof row.id === 'string' && row.id !== '' ? row.id : crypto.randomUUID()
  return { ...row, id }
}

function backfillDraftIds(draft: ServiceDraftSeed): ServiceDraft {
  return {
    ...draft,
    stops: draft.stops.map(backfillRowId),
    frequency_windows: draft.frequency_windows.map(backfillRowId),
  }
}

export interface SetAsideServiceDraft {
  draft: ServiceDraft
  stopCounter: number
}

export interface PersistedDrafts {
  serviceDraft: ServiceDraft | null
  scenarioDraft: ScenarioInput | null
  editingServiceId: string | null
  editingScenarioId: string | null
  serviceStopCounter: number
  setAsideServiceDraft: SetAsideServiceDraft | null
}

function emptyPersistedDrafts(): PersistedDrafts {
  return {
    serviceDraft: null,
    scenarioDraft: null,
    editingServiceId: null,
    editingScenarioId: null,
    serviceStopCounter: 0,
    setAsideServiceDraft: null,
  }
}

function isStop(value: unknown): value is Unidentified<DraftStop> {
  const stop = value as Partial<DraftStop> | null
  return (
    typeof stop?.lat === 'number' &&
    typeof stop.lng === 'number' &&
    typeof stop.name === 'string' &&
    typeof stop.seq === 'number'
  )
}

function isVehicleParams(value: unknown): value is VehicleParams {
  const vehicle = value as Partial<VehicleParams> | null
  return (
    typeof vehicle?.max_speed_kmh === 'number' &&
    typeof vehicle.acceleration_ms2 === 'number' &&
    typeof vehicle.deceleration_ms2 === 'number' &&
    typeof vehicle.dwell_s === 'number'
  )
}

function isFrequencyWindow(value: unknown): value is Unidentified<DraftFrequencyWindow> {
  const frequencyWindow = value as Partial<DraftFrequencyWindow> | null
  return (
    typeof frequencyWindow?.start_time === 'string' &&
    typeof frequencyWindow.end_time === 'string' &&
    typeof frequencyWindow.headway_s === 'number'
  )
}

function isAbsentOrString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isServiceInput(value: unknown): value is ServiceDraftSeed {
  const service = value as Partial<ServiceDraftSeed> | null
  // The prose is allowed to be missing, not just empty: every draft stored
  // before a service had prose lacks both keys, and requiring them here would
  // throw each of those drafts away on the next read.
  // A row id is allowed to be missing too: every draft stored before stops and
  // frequency windows carried a client-only id lacks that key, and requiring
  // it here would throw those drafts away on the next read.
  return (
    typeof service?.route_slug === 'string' &&
    typeof service.name === 'string' &&
    isAbsentOrString(service.subtext) &&
    isAbsentOrString(service.description) &&
    Array.isArray(service.stops) &&
    service.stops.every(isStop) &&
    isVehicleParams(service.vehicle) &&
    Array.isArray(service.frequency_windows) &&
    service.frequency_windows.every(isFrequencyWindow)
  )
}

function isStopIdentity(value: unknown): boolean {
  const stop = value as Partial<StopIdentity> | null
  return typeof stop?.service_id === 'string' && typeof stop.slug === 'string'
}

function isInterchangePair(value: unknown): value is InterchangePair {
  const pair = value as Partial<InterchangePair> | null
  return isStopIdentity(pair?.a) && isStopIdentity(pair?.b)
}

function isBoardingWait(value: unknown): value is BoardingWaitOverride {
  const wait = value as Partial<BoardingWaitOverride> | null
  return (
    BOARDING_WAIT_POLICIES.includes(wait?.policy as BoardingWaitPolicy) &&
    (wait?.secs === undefined || typeof wait.secs === 'number')
  )
}

// A draft saved before SPA-404 has neither interchange_pairs nor boarding_wait.
// It is still a sound draft, so those two are filled in rather than held
// against it; only a value that is present and malformed sinks it.
function readScenarioDraft(value: unknown): ScenarioInput | null {
  const scenario = value as Partial<ScenarioInput> | null
  const sound =
    typeof scenario?.name === 'string' &&
    typeof scenario.description === 'string' &&
    Array.isArray(scenario.service_ids) &&
    scenario.service_ids.every((id) => typeof id === 'string') &&
    (scenario.interchange_pairs === undefined ||
      (Array.isArray(scenario.interchange_pairs) && scenario.interchange_pairs.every(isInterchangePair))) &&
    (scenario.boarding_wait === undefined || scenario.boarding_wait === null || isBoardingWait(scenario.boarding_wait))
  if (!sound) return null
  return {
    name: scenario.name!,
    description: scenario.description!,
    service_ids: scenario.service_ids!,
    interchange_pairs: scenario.interchange_pairs ?? [],
    boarding_wait: scenario.boarding_wait ?? null,
  }
}

// Falls back to zero rather than discarding the draft: a lost counter costs a
// repeated stop number, which takeStopNumber's floor then fixes.
function readStopCounter(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function readSetAsideServiceDraft(value: unknown): SetAsideServiceDraft | null {
  const setAside = value as Partial<SetAsideServiceDraft> | null
  if (!isServiceInput(setAside?.draft)) return null
  return { draft: backfillDraftIds(setAside.draft), stopCounter: readStopCounter(setAside.stopCounter) }
}

function readPersistedDrafts(userId: string): PersistedDrafts {
  const parsed = readJson<PersistedDrafts>(draftsStorageKey(userId))
  if (!parsed) return emptyPersistedDrafts()

  // Each draft stands or falls on its own: a corrupt service draft is no reason
  // to throw away a sound scenario sitting beside it.
  const serviceDraft = isServiceInput(parsed.serviceDraft) ? backfillDraftIds(parsed.serviceDraft) : null
  const scenarioDraft = readScenarioDraft(parsed.scenarioDraft)
  const setAsideServiceDraft = readSetAsideServiceDraft(parsed.setAsideServiceDraft)
  const scenario = {
    scenarioDraft,
    editingScenarioId:
      scenarioDraft && typeof parsed.editingScenarioId === 'string' ? parsed.editingScenarioId : null,
  }

  // An edit that did not survive hands the slot back to the draft it set
  // aside, rather than stranding that draft beneath an edit that is gone.
  if (!serviceDraft && setAsideServiceDraft) {
    return {
      ...scenario,
      serviceDraft: setAsideServiceDraft.draft,
      editingServiceId: null,
      serviceStopCounter: setAsideServiceDraft.stopCounter,
      setAsideServiceDraft: null,
    }
  }
  return {
    ...scenario,
    serviceDraft,
    // An editing target without its draft edits nothing, so it goes too.
    editingServiceId:
      serviceDraft && typeof parsed.editingServiceId === 'string' ? parsed.editingServiceId : null,
    serviceStopCounter: serviceDraft ? readStopCounter(parsed.serviceStopCounter) : 0,
    setAsideServiceDraft,
  }
}

export const useDraftsStore = defineStore('drafts', () => {
  const auth = useAuthStore()

  const serviceDraft = ref<ServiceDraft | null>(null)
  const scenarioDraft = ref<ScenarioInput | null>(null)
  const editingServiceId = ref<string | null>(null)
  const editingScenarioId = ref<string | null>(null)
  const serviceStopCounter = ref(0)
  const setAsideServiceDraft = ref<SetAsideServiceDraft | null>(null)

  // Writes go under this id rather than reading auth again, so drafts can never
  // land under the key of an account that signed in after they were typed.
  let ownerId: string | null = null

  const hasServiceDraft = computed(() => serviceDraft.value !== null)
  const hasScenarioDraft = computed(() => scenarioDraft.value !== null)

  // Persistence is best-effort: a full or disabled store must not break editing.
  function persist(): void {
    const owner = ownerId
    if (!owner) return

    if (!serviceDraft.value && !scenarioDraft.value && !setAsideServiceDraft.value) {
      removeKey(draftsStorageKey(owner))
      return
    }
    const snapshot: PersistedDrafts = {
      serviceDraft: serviceDraft.value,
      scenarioDraft: scenarioDraft.value,
      editingServiceId: editingServiceId.value,
      editingScenarioId: editingScenarioId.value,
      serviceStopCounter: serviceStopCounter.value,
      setAsideServiceDraft: setAsideServiceDraft.value,
    }
    writeJson(draftsStorageKey(owner), snapshot)
  }

  // Drafts are edited as much through form bindings writing into them as
  // through the actions below, so persistence hangs off a deep watcher rather
  // than each mutator — a v-model must not be able to slip past it.
  watch(
    [serviceDraft, scenarioDraft, editingServiceId, editingScenarioId, serviceStopCounter, setAsideServiceDraft],
    persist,
    { deep: true },
  )

  // Keyed on auth.userId, not auth.user: the full record arrives only once
  // /api/auth/me answers, and a draft must not hang on a network call that may
  // be slow or fail outright while the session stays perfectly valid. The watch
  // still runs, because the id can change mid-session — sign-in, sign-out, or a
  // switch between accounts.
  watch(
    () => auth.userId,
    (userId) => {
      ownerId = userId
      // Signing out drops drafts from memory but leaves the stored copy alone:
      // it is still the owner's unsaved work, waiting for them to sign back in.
      const adopted = userId ? readPersistedDrafts(userId) : emptyPersistedDrafts()
      serviceDraft.value = adopted.serviceDraft
      scenarioDraft.value = adopted.scenarioDraft
      editingServiceId.value = adopted.editingServiceId
      editingScenarioId.value = adopted.editingScenarioId
      serviceStopCounter.value = adopted.serviceStopCounter
      setAsideServiceDraft.value = adopted.setAsideServiceDraft
    },
    { immediate: true },
  )

  function startServiceDraft(seed?: ServiceDraftSeed, serviceId: string | null = null): void {
    // There is one slot, so opening an edit over a create draft sets the create
    // draft aside rather than overwriting it: it is work no API can hand back.
    // An edit displaced by another edit is simply dropped — what it would have
    // saved over is still on the server.
    if (serviceId !== null && serviceDraft.value && editingServiceId.value === null) {
      setAsideServiceDraft.value = { draft: serviceDraft.value, stopCounter: serviceStopCounter.value }
    }
    // Cloned so editing the draft never mutates the caller's service. Ids the
    // seed already carries stay; rows from before this field existed get one.
    serviceDraft.value = seed ? backfillDraftIds(structuredClone(seed)) : emptyServiceDraft()
    editingServiceId.value = serviceId
    serviceStopCounter.value = 0
  }

  // Hands out the next number for a click-placed `Stop N`. Monotonic and
  // persisted alongside the draft, so neither deleting a stop nor reloading
  // the page can issue a number twice — stop slugs are minted from these
  // names server-side, and a reused number would move a slug underneath
  // whatever already holds it. Floored by the names the draft already carries,
  // which is what stops a draft seeded from an existing service colliding
  // with numbers this counter never issued.
  function takeStopNumber(): number {
    const highestInDraft = (serviceDraft.value?.stops ?? []).reduce((highest, stop) => {
      const match = AUTO_STOP_NAME.exec(stop.name)
      return match ? Math.max(highest, Number(match[1])) : highest
    }, 0)
    serviceStopCounter.value = Math.max(serviceStopCounter.value, highestInDraft) + 1
    return serviceStopCounter.value
  }

  // Patched in place rather than replaced: swapping the draft object out
  // invalidates every computed derived from it, so naming a service redrew all
  // of its stops on the authoring map. Only the patched fields are reactive
  // writes, so untouched ones — `stops` above all — stay undisturbed.
  function patchServiceDraft(patch: Partial<ServiceDraft>): void {
    if (!serviceDraft.value) return
    Object.assign(serviceDraft.value, patch)
  }

  function addStop(stop: Stop): void {
    if (!serviceDraft.value) return
    serviceDraft.value.stops = renumber([
      ...serviceDraft.value.stops,
      { id: crypto.randomUUID(), name: stop.name, lat: stop.lat, lng: stop.lng, seq: stop.seq },
    ])
  }

  function removeStop(index: number): void {
    if (!serviceDraft.value) return
    serviceDraft.value.stops = renumber(serviceDraft.value.stops.filter((_, i) => i !== index))
  }

  function updateStop(index: number, patch: Partial<Stop>): void {
    if (!serviceDraft.value) return
    const stops = serviceDraft.value.stops
    if (index < 0 || index >= stops.length) return
    serviceDraft.value.stops = stops.map((s, i) => (i === index ? { ...s, ...patch } : s))
  }

  // The reordering the order-fault check asks the user to do by hand, since
  // map-drag reordering is out of scope.
  function moveStop(index: number, direction: -1 | 1): void {
    if (!serviceDraft.value) return
    const stops = serviceDraft.value.stops
    const target = index + direction
    if (target < 0 || target >= stops.length) return
    const next = [...stops]
    ;[next[index], next[target]] = [next[target], next[index]]
    serviceDraft.value.stops = renumber(next)
  }

  function addFrequencyWindow(window: FrequencyWindow): void {
    if (!serviceDraft.value) return
    serviceDraft.value.frequency_windows = [
      ...serviceDraft.value.frequency_windows,
      {
        id: crypto.randomUUID(),
        start_time: window.start_time,
        end_time: window.end_time,
        headway_s: window.headway_s,
      },
    ]
  }

  function removeFrequencyWindow(index: number): void {
    if (!serviceDraft.value) return
    serviceDraft.value.frequency_windows = serviceDraft.value.frequency_windows.filter((_, i) => i !== index)
  }

  function updateFrequencyWindow(index: number, patch: Partial<FrequencyWindow>): void {
    if (!serviceDraft.value) return
    serviceDraft.value.frequency_windows = serviceDraft.value.frequency_windows.map((w, i) =>
      i === index ? { ...w, ...patch } : w,
    )
  }

  // Ending a draft, whether it was saved or given up, hands the slot back to
  // whatever an edit set aside.
  function clearServiceDraft(): void {
    const setAside = setAsideServiceDraft.value
    serviceDraft.value = setAside?.draft ?? null
    editingServiceId.value = null
    serviceStopCounter.value = setAside?.stopCounter ?? 0
    setAsideServiceDraft.value = null
  }

  function startScenarioDraft(seed?: ScenarioInput, scenarioId: string | null = null): void {
    // Cloned so editing the draft never mutates the caller's scenario.
    scenarioDraft.value = seed ? structuredClone(seed) : emptyScenarioDraft()
    editingScenarioId.value = scenarioId
  }

  function patchScenarioDraft(patch: Partial<ScenarioInput>): void {
    if (!scenarioDraft.value) return
    scenarioDraft.value = { ...scenarioDraft.value, ...patch }
  }

  function toggleService(serviceId: string): void {
    if (!scenarioDraft.value) return
    const selected = scenarioDraft.value.service_ids
    scenarioDraft.value.service_ids = selected.includes(serviceId)
      ? selected.filter((id) => id !== serviceId)
      : [...selected, serviceId]
  }

  function clearScenarioDraft(): void {
    scenarioDraft.value = null
    editingScenarioId.value = null
  }

  return {
    serviceDraft,
    scenarioDraft,
    editingServiceId,
    editingScenarioId,
    setAsideServiceDraft,
    hasServiceDraft,
    hasScenarioDraft,
    startServiceDraft,
    patchServiceDraft,
    takeStopNumber,
    addStop,
    removeStop,
    updateStop,
    moveStop,
    addFrequencyWindow,
    removeFrequencyWindow,
    updateFrequencyWindow,
    clearServiceDraft,
    startScenarioDraft,
    patchScenarioDraft,
    toggleService,
    clearScenarioDraft,
  }
})
