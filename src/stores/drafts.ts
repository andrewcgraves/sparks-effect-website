// In-progress service and scenario drafts, held centrally so they survive navigation.
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ScenarioInput, ServiceInput, Stop, VehicleParams } from '../api/authoring'

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

export const useDraftsStore = defineStore('drafts', () => {
  const serviceDraft = ref<ServiceInput | null>(null)
  const scenarioDraft = ref<ScenarioInput | null>(null)
  // Set when the draft edits an existing record; null means "creating new".
  const editingServiceId = ref<string | null>(null)
  const editingScenarioId = ref<string | null>(null)

  const hasServiceDraft = computed(() => serviceDraft.value !== null)
  const hasScenarioDraft = computed(() => scenarioDraft.value !== null)

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
