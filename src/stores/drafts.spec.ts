import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, nextTick } from 'vue'
import { draftsStorageKey, useDraftsStore, type PersistedDrafts } from './drafts'
import { AUTH_STORAGE_KEY, useAuthStore } from './auth'
import type { ScenarioInput, ServiceInput, Stop } from '../api/authoring'

function stop(name: string, seq: number): Stop {
  return { lat: 34.05, lng: -118.24, name, seq }
}

function service(name: string): ServiceInput {
  return {
    route_slug: 'main-line',
    name,
    stops: [stop('A', 0)],
    vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
    frequency_windows: [{ start_time: '06:00', end_time: '09:00', headway_s: 600 }],
  }
}

function scenario(name: string): ScenarioInput {
  return { name, description: 'Rush hour', service_ids: ['svc-1'] }
}

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
        route_slug: '',
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
          route_slug: 'main-line',
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

    // Editing the name once redrew every stop on the authoring map, because
    // replacing the draft object invalidated every computed derived from it.
    it('patchServiceDraft leaves stop-derived computeds untouched', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop('A', 0))
      const stopCoords = computed(() =>
        (drafts.serviceDraft?.stops ?? []).map((s) => ({ lat: s.lat, lng: s.lng })),
      )
      const before = stopCoords.value

      drafts.patchServiceDraft({ name: 'Red Line' })

      expect(stopCoords.value).toBe(before)
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

    it('updateStop patches one stop by index without touching the rest', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop('A', 0))
      drafts.addStop(stop('B', 0))
      const id = drafts.serviceDraft!.stops[0].id
      drafts.updateStop(0, { lat: 40, lng: -70 })
      expect(drafts.serviceDraft?.stops[0]).toEqual(expect.objectContaining({ id, name: 'A', lat: 40, lng: -70 }))
      expect(drafts.serviceDraft?.stops[1].name).toBe('B')
    })

    it('updateStop is a no-op for an out-of-range index', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop('A', 0))
      drafts.updateStop(5, { lat: 40 })
      expect(drafts.serviceDraft?.stops).toHaveLength(1)
    })

    it('moveStop swaps a stop with its predecessor and renumbers', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop('A', 0))
      drafts.addStop(stop('B', 0))
      drafts.addStop(stop('C', 0))
      drafts.moveStop(2, -1)
      expect(drafts.serviceDraft?.stops.map((s) => [s.name, s.seq])).toEqual([
        ['A', 0],
        ['C', 1],
        ['B', 2],
      ])
    })

    it('moveStop swaps a stop with its successor and renumbers', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop('A', 0))
      drafts.addStop(stop('B', 0))
      drafts.moveStop(0, 1)
      expect(drafts.serviceDraft?.stops.map((s) => [s.name, s.seq])).toEqual([
        ['B', 0],
        ['A', 1],
      ])
    })

    it('moveStop is a no-op past either end of the list', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop('A', 0))
      drafts.addStop(stop('B', 0))
      drafts.moveStop(0, -1)
      drafts.moveStop(1, 1)
      expect(drafts.serviceDraft?.stops.map((s) => s.name)).toEqual(['A', 'B'])
    })

    it('moveStop keeps each stop id while seq follows the new position', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop('A', 0))
      drafts.addStop(stop('B', 0))
      drafts.addStop(stop('C', 0))
      const ids = drafts.serviceDraft!.stops.map((s) => s.id)

      drafts.moveStop(2, -1)

      expect(drafts.serviceDraft?.stops.map((s) => s.id)).toEqual([ids[0], ids[2], ids[1]])
      expect(drafts.serviceDraft?.stops.map((s) => s.seq)).toEqual([0, 1, 2])
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
        route_slug: 'main-line',
        name: 'Persisted',
        stops: [],
        vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
        frequency_windows: [],
      })
      expect(useDraftsStore().serviceDraft?.name).toBe('Persisted')
    })

    it('addFrequencyWindow appends a window', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addFrequencyWindow({ start_time: '06:00', end_time: '22:00', headway_s: 900 })
      expect(drafts.serviceDraft?.frequency_windows).toEqual([
        { id: expect.any(String), start_time: '06:00', end_time: '22:00', headway_s: 900 },
      ])
    })

    it('removeFrequencyWindow drops a window by index', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addFrequencyWindow({ start_time: '06:00', end_time: '10:00', headway_s: 600 })
      drafts.addFrequencyWindow({ start_time: '10:00', end_time: '22:00', headway_s: 1200 })
      const kept = drafts.serviceDraft!.frequency_windows[1].id
      drafts.removeFrequencyWindow(0)
      expect(drafts.serviceDraft?.frequency_windows).toEqual([
        { id: kept, start_time: '10:00', end_time: '22:00', headway_s: 1200 },
      ])
    })

    it('updateFrequencyWindow patches a window by index', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addFrequencyWindow({ start_time: '06:00', end_time: '22:00', headway_s: 900 })
      const id = drafts.serviceDraft!.frequency_windows[0].id
      drafts.updateFrequencyWindow(0, { headway_s: 1800 })
      expect(drafts.serviceDraft?.frequency_windows[0]).toEqual({
        id,
        start_time: '06:00',
        end_time: '22:00',
        headway_s: 1800,
      })
    })
  })

  // One slot holds the service draft on screen. An edit opened over a create
  // draft must not cost the author that create draft, which no API can hand back.
  describe('an edit opened over a create draft', () => {
    function createThenEdit() {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Half-authored'))
      drafts.takeStopNumber()
      drafts.takeStopNumber()
      drafts.startServiceDraft(service('Blue Line'), 'svc-1')
      return drafts
    }

    it('sets the create draft aside rather than overwriting it', () => {
      const drafts = createThenEdit()

      expect(drafts.serviceDraft?.name).toBe('Blue Line')
      expect(drafts.editingServiceId).toBe('svc-1')
      expect(drafts.setAsideServiceDraft?.draft.name).toBe('Half-authored')
    })

    it('hands the slot back to the create draft, counter and all, once the edit is cleared', () => {
      const drafts = createThenEdit()

      drafts.clearServiceDraft()

      expect(drafts.serviceDraft?.name).toBe('Half-authored')
      expect(drafts.editingServiceId).toBeNull()
      expect(drafts.setAsideServiceDraft).toBeNull()
      expect(drafts.takeStopNumber()).toBe(3)
    })

    it('keeps the create draft aside when another edit displaces the first', () => {
      const drafts = createThenEdit()

      drafts.startServiceDraft(service('Red Line'), 'svc-2')
      drafts.clearServiceDraft()

      expect(drafts.serviceDraft?.name).toBe('Half-authored')
    })

    it('sets nothing aside when there was no create draft to protect', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'), 'svc-1')

      drafts.clearServiceDraft()

      expect(drafts.hasServiceDraft).toBe(false)
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
      route_slug: 'main-line',
      name: 'Blue Line',
      stops: [stop('A', 0)],
      vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
      frequency_windows: [],
    }
    drafts.startServiceDraft(source)
    drafts.addStop(stop('B', 0))
    drafts.patchServiceDraft({ name: 'Changed' })
    expect(source.stops).toEqual([stop('A', 0)])
    expect(source.name).toBe('Blue Line')
  })

  it('backfills ids a seed omitted and keeps ids it already has', () => {
    const drafts = useDraftsStore()
    const source = {
      route_slug: 'main-line',
      name: 'Blue Line',
      stops: [{ id: 'keep-stop', ...stop('A', 0) }, stop('B', 1)],
      vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
      frequency_windows: [
        { id: 'keep-window', start_time: '06:00', end_time: '09:00', headway_s: 600 },
        { start_time: '09:00', end_time: '12:00', headway_s: 900 },
      ],
    }
    drafts.startServiceDraft(source)

    expect(source.stops[1]).not.toHaveProperty('id')
    expect(source.frequency_windows[1]).not.toHaveProperty('id')
    expect(drafts.serviceDraft?.stops[0].id).toBe('keep-stop')
    expect(drafts.serviceDraft?.stops[1].id).toEqual(expect.any(String))
    expect(drafts.serviceDraft?.stops[1].id).not.toBe('')
    expect(drafts.serviceDraft?.frequency_windows[0].id).toBe('keep-window')
    expect(drafts.serviceDraft?.frequency_windows[1].id).toEqual(expect.any(String))
    expect(drafts.serviceDraft?.frequency_windows[1].id).not.toBe('')
  })

  // Numbers name the stops placed by clicking the map. Reusing one would move
  // a stop slug underneath whatever already holds it, so the counter only ever
  // climbs — including across a reload, since the draft outlives the tab.
  describe('takeStopNumber', () => {
    it('counts up from one', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      expect([drafts.takeStopNumber(), drafts.takeStopNumber()]).toEqual([1, 2])
    })

    it('does not reissue the number of a deleted stop', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop(`Stop ${drafts.takeStopNumber()}`, 0))
      drafts.addStop(stop(`Stop ${drafts.takeStopNumber()}`, 1))
      drafts.removeStop(1)

      expect(drafts.takeStopNumber()).toBe(3)
    })

    it('does not reissue a number after a reload', async () => {
      useAuthStore().signIn('tok-u1', { id: 'u1' })
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.addStop(stop(`Stop ${drafts.takeStopNumber()}`, 0))
      drafts.addStop(stop(`Stop ${drafts.takeStopNumber()}`, 1))
      await nextTick()

      const restored = reloadAs('u1')
      restored.removeStop(1)

      expect(restored.takeStopNumber()).toBe(3)
    })

    // A draft seeded from an existing service arrives with names the counter
    // has never issued; handing one out again would duplicate it in the list.
    it('clears the names a seeded draft already carries', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft({ ...service('Blue Line'), stops: [stop('Stop 4', 0)] })

      expect(drafts.takeStopNumber()).toBe(5)
    })

    it('starts over for a new draft', () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft()
      drafts.takeStopNumber()
      drafts.startServiceDraft()

      expect(drafts.takeStopNumber()).toBe(1)
    })
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

    it('restores a service draft stored before services had prose', () => {
      // Exactly what an older build wrote: no subtext or description key at all.
      const legacy = {
        route_slug: 'main-line',
        name: 'Blue Line',
        stops: [stop('Stop 3', 0)],
        vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
        frequency_windows: [{ start_time: '06:00', end_time: '09:00', headway_s: 600 }],
      }
      window.localStorage.setItem(
        draftsStorageKey('u1'),
        JSON.stringify({ serviceDraft: legacy, editingServiceId: 'svc-1', serviceStopCounter: 7 }),
      )

      const restored = reloadAs('u1')
      expect(restored.serviceDraft).toEqual({
        ...legacy,
        stops: [{ id: expect.any(String), ...stop('Stop 3', 0) }],
        frequency_windows: [{ id: expect.any(String), start_time: '06:00', end_time: '09:00', headway_s: 600 }],
      })
      expect(restored.editingServiceId).toBe('svc-1')
      expect(restored.takeStopNumber()).toBe(8)
    })

    it('backfills ids when a persisted draft was stored without them', () => {
      const withoutIds = {
        route_slug: 'main-line',
        name: 'Blue Line',
        stops: [stop('A', 0), stop('B', 1)],
        vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
        frequency_windows: [
          { start_time: '06:00', end_time: '09:00', headway_s: 600 },
          { start_time: '09:00', end_time: '18:00', headway_s: 900 },
        ],
      }
      window.localStorage.setItem(
        draftsStorageKey('u1'),
        JSON.stringify({
          serviceDraft: withoutIds,
          setAsideServiceDraft: { draft: { ...withoutIds, name: 'Set aside' }, stopCounter: 3 },
        }),
      )

      const restored = reloadAs('u1')

      expect(restored.serviceDraft).not.toBeNull()
      expect(restored.setAsideServiceDraft).not.toBeNull()
      for (const draft of [restored.serviceDraft, restored.setAsideServiceDraft?.draft]) {
        const ids = [
          ...(draft?.stops ?? []).map((row) => row.id),
          ...(draft?.frequency_windows ?? []).map((row) => row.id),
        ]
        expect(ids).toHaveLength(4)
        expect(new Set(ids).size).toBe(ids.length)
        for (const id of ids) {
          expect(id).toEqual(expect.any(String))
          expect(id).not.toBe('')
        }
      }
    })

    it('keeps the ids a persisted draft already stored', () => {
      const stored = {
        route_slug: 'main-line',
        name: 'Blue Line',
        stops: [
          { id: 'stop-a', ...stop('A', 0) },
          { id: 'stop-b', ...stop('B', 1) },
        ],
        vehicle: { max_speed_kmh: 90, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 20 },
        frequency_windows: [{ id: 'window-am', start_time: '06:00', end_time: '09:00', headway_s: 600 }],
      }
      window.localStorage.setItem(
        draftsStorageKey('u1'),
        JSON.stringify({
          serviceDraft: stored,
          setAsideServiceDraft: {
            draft: {
              ...stored,
              name: 'Set aside',
              stops: [{ id: 'aside-stop', ...stop('C', 0) }],
              frequency_windows: [{ id: 'aside-window', start_time: '10:00', end_time: '12:00', headway_s: 1200 }],
            },
            stopCounter: 1,
          },
        }),
      )

      const restored = reloadAs('u1')
      expect(restored.serviceDraft?.stops.map((row) => row.id)).toEqual(['stop-a', 'stop-b'])
      expect(restored.serviceDraft?.frequency_windows.map((row) => row.id)).toEqual(['window-am'])
      expect(restored.setAsideServiceDraft?.draft.stops.map((row) => row.id)).toEqual(['aside-stop'])
      expect(restored.setAsideServiceDraft?.draft.frequency_windows.map((row) => row.id)).toEqual(['aside-window'])
    })

    it('restores a service draft\'s subtext and description after a reload', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Blue Line'))
      drafts.patchServiceDraft({ subtext: 'Electrified · Light rail', description: 'First line.\n\nSecond.' })
      await nextTick()

      const restored = reloadAs('u1')
      expect(restored.serviceDraft?.subtext).toBe('Electrified · Light rail')
      expect(restored.serviceDraft?.description).toBe('First line.\n\nSecond.')
    })

    it.each([
      ['subtext', 42],
      ['description', null],
    ])('discards a draft whose %s is not text', (field, value) => {
      const corrupt = { ...service('Blue Line'), [field]: value }
      window.localStorage.setItem(draftsStorageKey('u1'), JSON.stringify({ serviceDraft: corrupt }))
      expect(reloadAs('u1').serviceDraft).toBeNull()
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

    it('restores a create draft set aside beneath an edit after a reload', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Half-authored'))
      drafts.startServiceDraft(service('Blue Line'), 'svc-1')
      await nextTick()

      const restored = reloadAs('u1')
      expect(restored.serviceDraft?.name).toBe('Blue Line')
      restored.clearServiceDraft()
      expect(restored.serviceDraft?.name).toBe('Half-authored')
    })

    it('persists the create draft a cleared edit handed back', async () => {
      const drafts = useDraftsStore()
      drafts.startServiceDraft(service('Half-authored'))
      drafts.startServiceDraft(service('Blue Line'), 'svc-1')
      drafts.clearServiceDraft()
      await nextTick()

      expect(persisted('u1')?.serviceDraft?.name).toBe('Half-authored')
      expect(persisted('u1')?.setAsideServiceDraft).toBeNull()
    })

    it('hands the slot back to the set-aside draft when the edit above it did not survive', () => {
      window.localStorage.setItem(
        draftsStorageKey('u1'),
        JSON.stringify({
          serviceDraft: { name: 'corrupt' },
          editingServiceId: 'svc-1',
          setAsideServiceDraft: { draft: service('Half-authored'), stopCounter: 4 },
        }),
      )

      const restored = reloadAs('u1')
      expect(restored.serviceDraft?.name).toBe('Half-authored')
      expect(restored.editingServiceId).toBeNull()
      expect(restored.setAsideServiceDraft).toBeNull()
      expect(restored.takeStopNumber()).toBe(5)
    })

    it('discards a malformed set-aside draft but keeps the edit above it', () => {
      window.localStorage.setItem(
        draftsStorageKey('u1'),
        JSON.stringify({
          serviceDraft: service('Blue Line'),
          editingServiceId: 'svc-1',
          setAsideServiceDraft: { draft: { name: 'corrupt' }, stopCounter: 4 },
        }),
      )

      const restored = reloadAs('u1')
      expect(restored.serviceDraft?.name).toBe('Blue Line')
      expect(restored.setAsideServiceDraft).toBeNull()
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
