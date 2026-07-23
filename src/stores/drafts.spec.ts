import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { draftsStorageKey, useDraftsStore, type PersistedDrafts } from './drafts'
import { AUTH_STORAGE_KEY, useAuthStore } from './auth'
import type { ScenarioInput, ServiceInput, Stop } from '../api/authoring'

function stop(name: string, seq: number): Stop {
  return { lat: 34.05, lng: -118.24, name, seq }
}

function service(name: string): ServiceInput {
  return {
    name,
    stops: [stop('A', 0)],
    vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
    frequency_windows: [{ start_time: '06:00', end_time: '09:00', headway_s: 600 }],
  }
}

function scenario(name: string): ScenarioInput {
  return { name, description: 'Rush hour', service_ids: ['svc-1'] }
}

// A fresh Pinia with the same signed-in user stands in for a page reload.
function reloadAs(userId: string) {
  setActivePinia(createPinia())
  useAuthStore().signIn(`tok-${userId}`, { id: userId })
  return useDraftsStore()
}

function persisted(userId: string): Partial<PersistedDrafts> | null {
  const raw = window.localStorage.getItem(draftsStorageKey(userId))
  return raw === null ? null : (JSON.parse(raw) as Partial<PersistedDrafts>)
}

describe('useDraftsStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  describe('persistence', () => {
    beforeEach(() => {
      useAuthStore().signIn('tok-u1', { id: 'u1' })
    })

    it('restores an in-progress service draft after a reload', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'), 'svc-1')
      drafts.addStop(stop('B', 0))
      await nextTick()

      const restored = reloadAs('u1')
      expect(restored.serviceDraft?.name).toBe('Blue Line')
      expect(restored.serviceDraft?.stops.map((s) => s.name)).toEqual(['A', 'B'])
      expect(restored.editingServiceId).toBe('svc-1')
      expect(restored.hasServiceDraft).toBe(true)
    })

    it('restores an in-progress scenario draft after a reload', async () => {
      const drafts = useDraftsStore()
      drafts.startScenarioDraft(scenario('Peak service'), 'scn-1')
      drafts.toggleService('svc-2')
      await nextTick()

      const restored = reloadAs('u1')
      expect(restored.scenarioDraft).toEqual({
        name: 'Peak service',
        description: 'Rush hour',
        service_ids: ['svc-1', 'svc-2'],
      })
      expect(restored.editingScenarioId).toBe('scn-1')
    })

    it('restores drafts on boot, before the identity fetch has resolved', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'), 'svc-1')
      await nextTick()

      // A real reload boots with only the persisted token: auth.user stays null
      // until /api/auth/me answers, which may be slow or fail outright while the
      // session itself is fine. Drafts cannot wait on it.
      setActivePinia(createPinia())
      const booted = useDraftsStore()
      expect(useAuthStore().user).toBeNull()
      expect(booted.serviceDraft?.name).toBe('Blue Line')
      expect(booted.editingServiceId).toBe('svc-1')
    })

    it('persists edits while the identity fetch is still outstanding', async () => {
      setActivePinia(createPinia())
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'))
      await nextTick()

      expect(persisted('u1')?.serviceDraft?.name).toBe('Blue Line')
    })

    it('adopts drafts once identity resolves for a session stored without an id', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'))
      await nextTick()

      // A session written before the account id was kept alongside the token:
      // there is nothing to key on until /api/auth/me answers.
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'tok-u1' }))
      setActivePinia(createPinia())
      const booted = useDraftsStore()
      expect(booted.serviceDraft).toBeNull()

      useAuthStore().signIn('tok-u1', { id: 'u1' })
      await nextTick()
      expect(booted.serviceDraft?.name).toBe('Blue Line')
    })

    it('persists edits made directly through the draft, as a form binding would', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'))
      if (drafts.serviceDraft) drafts.serviceDraft.name = 'Green Line'
      await nextTick()

      expect(reloadAs('u1').serviceDraft?.name).toBe('Green Line')
    })

    it('scopes drafts per user, so another account never sees them', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'))
      await nextTick()

      expect(reloadAs('u2').serviceDraft).toBeNull()
    })

    it('switching accounts without a reload swaps which drafts are in memory', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('u1 draft'))
      await nextTick()

      const auth = useAuthStore()
      auth.signOut()
      auth.signIn('tok-u2', { id: 'u2' })
      await nextTick()
      expect(drafts.serviceDraft).toBeNull()

      drafts.startServiceDraft(service('u2 draft'))
      await nextTick()
      expect(persisted('u1')?.serviceDraft?.name).toBe('u1 draft')
      expect(persisted('u2')?.serviceDraft?.name).toBe('u2 draft')
    })

    it('signing out clears drafts from memory but keeps the persisted copy for its owner', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'), 'svc-1')
      await nextTick()

      useAuthStore().signOut()
      await nextTick()
      expect(drafts.serviceDraft).toBeNull()
      expect(drafts.editingServiceId).toBeNull()

      // Signing back in returns the work rather than silently discarding it.
      expect(reloadAs('u1').serviceDraft?.name).toBe('Blue Line')
    })

    it('clearing the last draft removes the persisted copy', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'), 'svc-1')
      await nextTick()
      expect(persisted('u1')).not.toBeNull()

      drafts.clearServiceDraft()
      await nextTick()
      expect(persisted('u1')).toBeNull()
      expect(reloadAs('u1').serviceDraft).toBeNull()
    })

    it('clearing one draft leaves the other persisted', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'))
      drafts.startScenarioDraft(scenario('Peak service'))
      await nextTick()

      drafts.clearServiceDraft()
      await nextTick()

      const restored = reloadAs('u1')
      expect(restored.serviceDraft).toBeNull()
      expect(restored.scenarioDraft?.name).toBe('Peak service')
    })

    it('does not persist anything while signed out', async () => {
      useAuthStore().signOut()
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'))
      await nextTick()

      expect(persisted('u1')).toBeNull()
    })

    it('discards persisted data that is not valid JSON', () => {
      window.localStorage.setItem(draftsStorageKey('u1'), '{ not json')
      expect(reloadAs('u1').serviceDraft).toBeNull()
    })

    it('discards a malformed draft but keeps the sound one beside it', () => {
      window.localStorage.setItem(
        draftsStorageKey('u1'),
        JSON.stringify({ serviceDraft: { name: 'Blue Line' }, scenarioDraft: scenario('Peak service') }),
      )

      const restored = reloadAs('u1')
      expect(restored.serviceDraft).toBeNull()
      expect(restored.scenarioDraft?.name).toBe('Peak service')
    })

    it('discards a draft whose stops are malformed', () => {
      const corrupt = { ...service('Blue Line'), stops: [{ lat: 34.05, name: 'A' }] }
      window.localStorage.setItem(draftsStorageKey('u1'), JSON.stringify({ serviceDraft: corrupt }))
      expect(reloadAs('u1').serviceDraft).toBeNull()
    })

    it('drops an editing target whose draft did not survive', () => {
      window.localStorage.setItem(
        draftsStorageKey('u1'),
        JSON.stringify({ serviceDraft: null, editingServiceId: 'svc-1' }),
      )
      expect(reloadAs('u1').editingServiceId).toBeNull()
    })

    it('keeps the draft in memory when storage rejects the write', async () => {
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'))
      await nextTick()

      expect(drafts.serviceDraft?.name).toBe('Blue Line')
    })

    it('starts empty when storage cannot be read', () => {
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })

      expect(reloadAs('u1').serviceDraft).toBeNull()
    })
  })
})
