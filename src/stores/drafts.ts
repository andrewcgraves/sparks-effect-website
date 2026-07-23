// In-progress service and scenario drafts, held centrally so they survive
// navigation, and persisted so they survive a reload. A draft is the one piece
// of authoring state no API can hand back, so losing it loses real work.
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  FrequencyWindow,
  ScenarioInput,
  ServiceInput,
  Stop,
  VehicleParams,
} from '../api/authoring'
import { useAuthStore } from './auth'

// Prefix for the localStorage entry holding a user's drafts. A service with
// stops is a few KB, far inside quota, so localStorage is enough.
export const DRAFTS_STORAGE_KEY_PREFIX = 'sparks-effect.drafts'

// Drafts are keyed by owner rather than stored under one shared key, so a
// second account on the same browser can never open someone else's work.
export function draftsStorageKey(userId: string): string {
  return `${DRAFTS_STORAGE_KEY_PREFIX}.${userId}`
}

// Starting physics for a new service; authors tune these in the vehicle form.
const DEFAULT_VEHICLE: VehicleParams = {
  max_speed_kmh: 80,
  acceleration_ms2: 1.0,
  deceleration_ms2: 1.2,
  dwell_s: 30,
}

function emptyServiceDraft(): ServiceInput {
  return { name: '', stops: [], vehicle: { ...DEFAULT_VEHICLE }, frequency_windows: [] }
}

function emptyScenarioDraft(): ScenarioInput {
  return { name: '', description: '', service_ids: [] }
}

// Rewrites seq to match array order, keeping stop ordering canonical after edits.
function renumber(stops: Stop[]): Stop[] {
  return stops.map((stop, index) => ({ ...stop, seq: index }))
}

// Everything the store needs to resume editing exactly where the author left off.
interface PersistedDrafts {
  serviceDraft: ServiceInput | null
  scenarioDraft: ScenarioInput | null
  editingServiceId: string | null
  editingScenarioId: string | null
}

function noDrafts(): PersistedDrafts {
  return { serviceDraft: null, scenarioDraft: null, editingServiceId: null, editingScenarioId: null }
}

// Persisted drafts are validated field by field on the way in: a draft written
// by an older build, or half-written by a crashed tab, must be discarded rather
// than handed to a form that assumes the current shape.
function isStop(value: unknown): value is Stop {
  const stop = value as Partial<Stop> | null
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

function isFrequencyWindow(value: unknown): value is FrequencyWindow {
  const frequency = value as Partial<FrequencyWindow> | null
  return (
    typeof frequency?.start_time === 'string' &&
    typeof frequency.end_time === 'string' &&
    typeof frequency.headway_s === 'number'
  )
}

function isServiceInput(value: unknown): value is ServiceInput {
  const service = value as Partial<ServiceInput> | null
  return (
    typeof service?.name === 'string' &&
    Array.isArray(service.stops) &&
    service.stops.every(isStop) &&
    isVehicleParams(service.vehicle) &&
    Array.isArray(service.frequency_windows) &&
    service.frequency_windows.every(isFrequencyWindow)
  )
}

function isScenarioInput(value: unknown): value is ScenarioInput {
  const scenario = value as Partial<ScenarioInput> | null
  return (
    typeof scenario?.name === 'string' &&
    typeof scenario.description === 'string' &&
    Array.isArray(scenario.service_ids) &&
    scenario.service_ids.every((id) => typeof id === 'string')
  )
}

// Reads a user's drafts, tolerating absent, corrupt, or partial data. A draft
// for an existing record is restored as-is and wins over the server copy: it is
// the newer edit, and the author is mid-sentence in it.
function readPersistedDrafts(userId: string): PersistedDrafts {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(draftsStorageKey(userId))
  } catch {
    // Storage disabled (private mode, blocked cookies); start with a clean slate.
    return noDrafts()
  }
  if (!raw) return noDrafts()

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedDrafts>
    const serviceDraft = isServiceInput(parsed?.serviceDraft) ? parsed.serviceDraft : null
    const scenarioDraft = isScenarioInput(parsed?.scenarioDraft) ? parsed.scenarioDraft : null
    return {
      serviceDraft,
      scenarioDraft,
      // An editing target without its draft edits nothing, so it goes too.
      editingServiceId:
        serviceDraft && typeof parsed.editingServiceId === 'string' ? parsed.editingServiceId : null,
      editingScenarioId:
        scenarioDraft && typeof parsed.editingScenarioId === 'string'
          ? parsed.editingScenarioId
          : null,
    }
  } catch {
    return noDrafts()
  }
}

export const useDraftsStore = defineStore('drafts', () => {
  const auth = useAuthStore()

  const serviceDraft = ref<ServiceInput | null>(null)
  const scenarioDraft = ref<ScenarioInput | null>(null)
  // Set when the draft edits an existing record; null means "creating new".
  const editingServiceId = ref<string | null>(null)
  const editingScenarioId = ref<string | null>(null)

  // Who the in-memory drafts belong to, null while signed out. Writes go under
  // this id rather than reading auth again, so drafts can never land under the
  // key of an account that signed in after they were typed.
  let ownerId: string | null = null

  const hasServiceDraft = computed(() => serviceDraft.value !== null)
  const hasScenarioDraft = computed(() => scenarioDraft.value !== null)

  // Persistence is best-effort: a full or disabled store must not break editing.
  function persist(): void {
    const owner = ownerId
    if (!owner) return

    try {
      // No draft left to resume — clearing one, or saving it, ends here.
      if (!serviceDraft.value && !scenarioDraft.value) {
        window.localStorage.removeItem(draftsStorageKey(owner))
        return
      }
      const snapshot: PersistedDrafts = {
        serviceDraft: serviceDraft.value,
        scenarioDraft: scenarioDraft.value,
        editingServiceId: editingServiceId.value,
        editingScenarioId: editingScenarioId.value,
      }
      window.localStorage.setItem(draftsStorageKey(owner), JSON.stringify(snapshot))
    } catch {
      // Drafts stay in memory for this tab.
    }
  }

  // Drafts are edited as much through form bindings writing into them as
  // through the actions below, so persistence hangs off a deep watcher rather
  // than each mutator — a v-model must not be able to slip past it.
  watch([serviceDraft, scenarioDraft, editingServiceId, editingScenarioId], persist, { deep: true })

  // The signed-in user resolves asynchronously on boot (auth rehydrates it from
  // /api/auth/me), so drafts are adopted whenever the account changes rather
  // than read once at store creation.
  watch(
    () => auth.user?.id ?? null,
    (userId) => {
      ownerId = userId
      // Signing out drops drafts from memory but leaves the stored copy alone:
      // it is still the owner's unsaved work, waiting for them to sign back in.
      const adopted = userId ? readPersistedDrafts(userId) : noDrafts()
      serviceDraft.value = adopted.serviceDraft
      scenarioDraft.value = adopted.scenarioDraft
      editingServiceId.value = adopted.editingServiceId
      editingScenarioId.value = adopted.editingScenarioId
    },
    { immediate: true },
  )

  function startServiceDraft(seed?: ServiceInput, serviceId: string | null = null): void {
    // Cloned so editing the draft never mutates the caller's service.
    serviceDraft.value = seed ? structuredClone(seed) : emptyServiceDraft()
    editingServiceId.value = serviceId
  }

  function patchServiceDraft(patch: Partial<ServiceInput>): void {
    if (!serviceDraft.value) return
    serviceDraft.value = { ...serviceDraft.value, ...patch }
  }

  function addStop(stop: Stop): void {
    if (!serviceDraft.value) return
    serviceDraft.value.stops = renumber([...serviceDraft.value.stops, stop])
  }

  function removeStop(index: number): void {
    if (!serviceDraft.value) return
    serviceDraft.value.stops = renumber(serviceDraft.value.stops.filter((_, i) => i !== index))
  }

  function clearServiceDraft(): void {
    serviceDraft.value = null
    editingServiceId.value = null
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

  // Adds or removes a service from the scenario's selection.
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
    hasServiceDraft,
    hasScenarioDraft,
    startServiceDraft,
    patchServiceDraft,
    addStop,
    removeStop,
    clearServiceDraft,
    startScenarioDraft,
    patchScenarioDraft,
    toggleService,
    clearScenarioDraft,
  }
})
