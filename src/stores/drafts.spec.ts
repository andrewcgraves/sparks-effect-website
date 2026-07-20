import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDraftsStore } from './drafts'
import type { Stop } from '../api/authoring'

function stop(name: string, seq: number): Stop {
  return { lat: 34.05, lng: -118.24, name, seq }
}

describe('useDraftsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('service drafts', () => {
    it('starts with no draft', () => {
      const drafts = useDraftsStore()
      expect(drafts.serviceDraft).toBeNull()
      expect(drafts.hasServiceDraft).toBe(false)
    })

    it('startServiceDraft seeds an empty draft', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      expect(drafts.hasServiceDraft).toBe(true)
      expect(drafts.serviceDraft).toEqual({
        name: '',
        stops: [],
        vehicle: expect.objectContaining({ max_speed_kmh: expect.any(Number) }),
        frequency_windows: [],
      })
      expect(drafts.editingServiceId).toBeNull()
    })

    it('startServiceDraft seeds from an existing service for editing', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(
        {
          name: 'Blue Line',
          stops: [stop('A', 0)],
          vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
          frequency_windows: [],
        },
        'svc-1',
      )
      expect(drafts.serviceDraft?.name).toBe('Blue Line')
      expect(drafts.editingServiceId).toBe('svc-1')
    })

    it('patchServiceDraft merges fields without dropping the rest', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.patchServiceDraft({ name: 'Red Line' })
      expect(drafts.serviceDraft?.name).toBe('Red Line')
      expect(drafts.serviceDraft?.stops).toEqual([])
    })

    it('patchServiceDraft is a no-op when no draft is open', () => {
      const drafts = useDraftsStore()
      drafts.patchServiceDraft({ name: 'Red Line' })
      expect(drafts.serviceDraft).toBeNull()
    })

    it('addStop appends and normalizes seq', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop('A', 99))
      drafts.addStop(stop('B', 99))
      expect(drafts.serviceDraft?.stops.map((s) => [s.name, s.seq])).toEqual([
        ['A', 0],
        ['B', 1],
      ])
    })

    it('removeStop drops the stop and renumbers the remainder', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop('A', 0))
      drafts.addStop(stop('B', 0))
      drafts.addStop(stop('C', 0))
      drafts.removeStop(1)
      expect(drafts.serviceDraft?.stops.map((s) => [s.name, s.seq])).toEqual([
        ['A', 0],
        ['C', 1],
      ])
    })

    it('clearServiceDraft discards the draft and its editing target', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(undefined, 'svc-1')
      drafts.clearServiceDraft()
      expect(drafts.serviceDraft).toBeNull()
      expect(drafts.editingServiceId).toBeNull()
      expect(drafts.hasServiceDraft).toBe(false)
    })

    it('keeps the draft across repeated store lookups, as navigation would', () => {
      useDraftsStore().startServiceDraft({
        name: 'Persisted',
        stops: [],
        vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
        frequency_windows: [],
      })
      // A different view calling useDraftsStore() sees the same shared state.
      expect(useDraftsStore().serviceDraft?.name).toBe('Persisted')
    })
  })

  describe('scenario drafts', () => {
    it('startScenarioDraft seeds an empty draft', () => {
      const drafts = useDraftsStore()
      drafts.startScenarioDraft()
      expect(drafts.scenarioDraft).toEqual({ name: '', description: '', service_ids: [] })
      expect(drafts.hasScenarioDraft).toBe(true)
    })

    it('toggleService adds then removes a service id', () => {
      const drafts = useDraftsStore()
      drafts.startScenarioDraft()
      drafts.toggleService('svc-1')
      expect(drafts.scenarioDraft?.service_ids).toEqual(['svc-1'])
      drafts.toggleService('svc-1')
      expect(drafts.scenarioDraft?.service_ids).toEqual([])
    })

    it('toggleService is a no-op when no draft is open', () => {
      const drafts = useDraftsStore()
      drafts.toggleService('svc-1')
      expect(drafts.scenarioDraft).toBeNull()
    })

    it('patchScenarioDraft merges fields', () => {
      const drafts = useDraftsStore()
      drafts.startScenarioDraft()
      drafts.patchScenarioDraft({ description: 'A better city' })
      expect(drafts.scenarioDraft?.description).toBe('A better city')
      expect(drafts.scenarioDraft?.name).toBe('')
    })

    it('clearScenarioDraft discards the draft', () => {
      const drafts = useDraftsStore()
      drafts.startScenarioDraft(undefined, 'scn-1')
      drafts.clearScenarioDraft()
      expect(drafts.scenarioDraft).toBeNull()
      expect(drafts.editingScenarioId).toBeNull()
    })
  })

  it('startServiceDraft clones its seed so later edits do not mutate the source', () => {
    const drafts = useDraftsStore()
    const source = {
      name: 'Blue Line',
      stops: [stop('A', 0)],
      vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
      frequency_windows: [],
    }
    drafts.startServiceDraft(source)
    drafts.addStop(stop('B', 0))
    drafts.patchServiceDraft({ name: 'Changed' })
    expect(source.stops).toHaveLength(1)
    expect(source.name).toBe('Blue Line')
  })
})
