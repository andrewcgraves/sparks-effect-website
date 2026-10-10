import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OwnedRoute, Route, RouteInput } from '../api/authoring/types'

vi.mock('../api/authoring/routes', () => ({
  fetchMyRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
}))

import { useRouteDraft, usedBySentence } from './useRouteDraft'
import { createRoute, fetchMyRoute, updateRoute } from '../api/authoring/routes'
import { ApiError, SessionExpiredError } from '../api/authoring/client'

const sfToSj: [number, number][] = [[-122.4194, 37.7749], [-121.8863, 37.3382]]

// Due east along 37°N with wobbles of a few metres: what a traced railway
// looks like, and what 10 m of simplification takes down to its two ends.
const metres = (m: number) => m / 111_195
const east = (km: number): [number, number] => [-120 + (km / 111.195) / Math.cos((37 * Math.PI) / 180), 37]
const wobbly: [number, number][] = [east(0), [east(1)[0], 37 + metres(4)], [east(2)[0], 37 - metres(6)], east(3), east(4)]

const lineText = JSON.stringify({ type: 'LineString', coordinates: sfToSj })

const stubRoute: Route = {
  id: 'rt1',
  slug: 'main-line',
  name: 'Main Line',
  description: 'The spine',
  mode: 'rail',
  bidirectional: false,
  geometry: { type: 'LineString', coordinates: sfToSj },
  segments: [{ cant_mm: 0, curve_radius_m: 0, grade_pct: 0 }],
}

function owned(overrides: Partial<OwnedRoute> = {}): OwnedRoute {
  return { ...stubRoute, length_m: 62000, dependents: { services: 0, user_services: 0, segments: 1 }, ...overrides }
}

describe('usedBySentence', () => {
  it('counts curated and authored lines together', () => {
    expect(usedBySentence({ services: 1, user_services: 2, segments: 0 })).toBe('Used by 3 lines')
    expect(usedBySentence({ services: 0, user_services: 1, segments: 0 })).toBe('Used by 1 line')
  })

  it('says a route with no lines is not used yet, segments or not', () => {
    expect(usedBySentence({ services: 0, user_services: 0, segments: 4 })).toBe('Not used yet')
  })

  it('says use is unknown when the API sent no counts', () => {
    expect(usedBySentence(undefined)).toBe('Use unknown')
  })
})

describe('useRouteDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(createRoute).mockResolvedValue(stubRoute)
    vi.mocked(updateRoute).mockResolvedValue(stubRoute)
    vi.mocked(fetchMyRoute).mockResolvedValue(owned())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('a new route', () => {
    it('starts ready, in rail, both ways, with no shape', async () => {
      const draft = useRouteDraft()
      await draft.start()
      expect(draft.ready.value).toBe(true)
      expect(draft.mode.value).toBe('rail')
      expect(draft.bidirectional.value).toBe(true)
      expect(draft.pointCount.value).toBe(0)
      expect(draft.lengthM.value).toBe(0)
      expect(draft.mapRoutes.value).toEqual([])
      expect(fetchMyRoute).not.toHaveBeenCalled()
    })

    it('imports a GeoJSON line into the shape and measures it', () => {
      const draft = useRouteDraft()
      expect(draft.importGeoJson(lineText, 'spine.geojson')).toBe(true)
      expect(draft.coordinates.value).toEqual(sfToSj)
      expect(draft.pointCount.value).toBe(2)
      expect(draft.lengthM.value).toBeGreaterThan(60000)
      expect(draft.importNote.value).toBe('Imported 2 points from spine.geojson.')
      expect(draft.importError.value).toBe('')
      expect(draft.mapRoutes.value[0]?.geometry.coordinates).toEqual(sfToSj)
    })

    it('reports an import it cannot read, leaving the shape as it was', () => {
      const draft = useRouteDraft()
      draft.importGeoJson(lineText)
      expect(draft.importGeoJson('{"type":"Polygon","coordinates":[]}')).toBe(false)
      expect(draft.importError.value).toBe('This GeoJSON is a Polygon, not a line.')
      expect(draft.importNote.value).toBe('')
      expect(draft.coordinates.value).toEqual(sfToSj)
    })

    it('lets a map editor set the shape directly', () => {
      const draft = useRouteDraft()
      draft.setCoordinates([[-122, 37, 5], [-121, 36]])
      expect(draft.coordinates.value).toEqual([[-122, 37], [-121, 36]])
    })

    it('says nothing until something is typed or imported', () => {
      const draft = useRouteDraft()
      expect(draft.validationMessage.value).toBe('')
      expect(draft.canSave.value).toBe(false)
      expect(draft.hasChanges.value).toBe(false)
    })

    it('holds the missing name back until the field has been visited', () => {
      const draft = useRouteDraft()
      draft.importGeoJson(lineText)
      expect(draft.validationMessage.value).toBe('')
      expect(draft.canSave.value).toBe(false)
      draft.touchName()
      expect(draft.validationMessage.value).toBe('Name is required.')
    })

    it('words a short line the way the API would', () => {
      const draft = useRouteDraft()
      draft.name.value = 'Spur'
      draft.setCoordinates([sfToSj[0]])
      expect(draft.validationMessage.value).toBe('The route needs at least two points.')
      expect(draft.canSave.value).toBe(false)
    })

    it('creates with the flat ingest shape, trimming the name and leaving an empty description out', async () => {
      const draft = useRouteDraft()
      draft.importGeoJson(lineText)
      draft.name.value = '  Main Line '
      draft.mode.value = 'metro'
      draft.bidirectional.value = false
      expect(draft.canSave.value).toBe(true)

      await draft.submit()

      const sent = vi.mocked(createRoute).mock.calls[0][0] as RouteInput
      expect(sent).toEqual({
        type: 'LineString',
        coordinates: sfToSj,
        properties: { name: 'Main Line', mode: 'metro', bidirectional: false },
      })
      expect(draft.createdSlug.value).toBe('main-line')
      expect(draft.submitError.value).toBe('')
    })

    it('becomes the created route\'s editor, so a second save is a PUT of it rather than another create', async () => {
      const draft = useRouteDraft()
      draft.importGeoJson(lineText)
      draft.name.value = 'Main Line'
      await draft.submit()

      expect(draft.editing.value?.slug).toBe('main-line')
      expect(draft.hasChanges.value).toBe(false)
      expect(draft.canSave.value).toBe(false)

      draft.name.value = 'Spine'
      expect(draft.canSave.value).toBe(true)
      await draft.submit()

      expect(createRoute).toHaveBeenCalledTimes(1)
      expect(updateRoute).toHaveBeenCalledWith('main-line', expect.objectContaining({ properties: expect.objectContaining({ name: 'Spine' }) }))
    })

    it('sends a description when one was typed', async () => {
      const draft = useRouteDraft()
      draft.importGeoJson(lineText)
      draft.name.value = 'Main Line'
      draft.description.value = ' The spine '
      await draft.submit()
      expect((vi.mocked(createRoute).mock.calls[0][0] as RouteInput).properties.description).toBe('The spine')
    })

    it('words a refused create and keeps the draft', async () => {
      vi.mocked(createRoute).mockRejectedValue(
        new ApiError('POST failed: 422', 422, 'validation', { faults: [{ field: 'mode', rule: 'unknown', message: 'x' }] }),
      )
      const draft = useRouteDraft()
      draft.importGeoJson(lineText)
      draft.name.value = 'Main Line'
      await draft.submit()
      expect(draft.submitError.value).toBe("Mode isn't one we recognise.")
      expect(draft.createdSlug.value).toBeNull()
      expect(draft.submitting.value).toBe(false)
      expect(draft.coordinates.value).toEqual(sfToSj)
    })

    it('does not submit while a fault stands', async () => {
      const draft = useRouteDraft()
      draft.name.value = 'Main Line'
      await draft.submit()
      expect(createRoute).not.toHaveBeenCalled()
    })

    it('simplifies the shape on save by default, saying what that will do to the count', async () => {
      const draft = useRouteDraft()
      draft.name.value = 'Valley'
      draft.setCoordinates(wobbly)
      expect(draft.simplifyOnSave.value).toBe(true)
      expect(draft.pointCount.value).toBe(5)
      expect(draft.simplifyNote.value).toBe('5 points → 2 points on save')

      vi.mocked(createRoute).mockResolvedValue({ ...stubRoute, geometry: { type: 'LineString', coordinates: [east(0), east(4)] } })
      await draft.submit()

      expect((vi.mocked(createRoute).mock.calls[0][0] as RouteInput).coordinates).toEqual([east(0), east(4)])
      // The draft takes the saved shape, so the map shows what was kept.
      expect(draft.coordinates.value).toEqual([east(0), east(4)])
      expect(draft.simplifyNote.value).toBe('')
    })

    it('sends every point when simplifying is turned off', async () => {
      const draft = useRouteDraft()
      draft.name.value = 'Valley'
      draft.setCoordinates(wobbly)
      draft.simplifyOnSave.value = false
      expect(draft.simplifyNote.value).toBe('')
      await draft.submit()
      expect((vi.mocked(createRoute).mock.calls[0][0] as RouteInput).coordinates).toEqual(wobbly)
    })

    it('says nothing when simplifying would keep every point', () => {
      const draft = useRouteDraft()
      draft.setCoordinates(sfToSj)
      expect(draft.simplifyNote.value).toBe('')
    })
  })

  describe('editing a route', () => {
    it('reads the route into the form and counts no changes', async () => {
      const draft = useRouteDraft('main-line')
      expect(draft.loading.value).toBe(true)
      expect(draft.ready.value).toBe(false)

      await draft.start()

      expect(fetchMyRoute).toHaveBeenCalledWith('main-line')
      expect(draft.ready.value).toBe(true)
      expect(draft.loading.value).toBe(false)
      expect(draft.name.value).toBe('Main Line')
      expect(draft.description.value).toBe('The spine')
      expect(draft.mode.value).toBe('rail')
      expect(draft.bidirectional.value).toBe(false)
      expect(draft.coordinates.value).toEqual(sfToSj)
      expect(draft.hasChanges.value).toBe(false)
      expect(draft.canSave.value).toBe(false)
      expect(draft.geometryLocked.value).toBe(false)
    })

    it('reports a route that is not the caller\'s', async () => {
      vi.mocked(fetchMyRoute).mockRejectedValue(new ApiError('not found', 404))
      const draft = useRouteDraft('someone-elses')
      await draft.start()
      expect(draft.editNotFound.value).toBe(true)
      expect(draft.editLoadFailed.value).toBe(false)
      expect(draft.loading.value).toBe(false)
    })

    it('reports a route that fails to load for another reason', async () => {
      vi.mocked(fetchMyRoute).mockRejectedValue(new Error('boom'))
      const draft = useRouteDraft('main-line')
      await draft.start()
      expect(draft.editLoadFailed.value).toBe(true)
      expect(draft.editNotFound.value).toBe(false)
    })

    it('stays loading, not failed, when the read is refused for an expired session', async () => {
      vi.mocked(fetchMyRoute).mockRejectedValue(new SessionExpiredError('GET failed: 401'))
      const draft = useRouteDraft('main-line')
      await draft.start()
      expect(draft.loading.value).toBe(true)
      expect(draft.editLoadFailed.value).toBe(false)
    })

    it('saves a renamed route with a PUT, keeping its segments while the shape is unchanged', async () => {
      const draft = useRouteDraft('main-line')
      await draft.start()
      draft.name.value = 'Spine'
      expect(draft.hasChanges.value).toBe(true)
      expect(draft.canSave.value).toBe(true)

      vi.mocked(updateRoute).mockResolvedValue({ ...stubRoute, name: 'Spine' })
      await draft.submit()

      expect(updateRoute).toHaveBeenCalledWith('main-line', {
        type: 'LineString',
        coordinates: sfToSj,
        properties: { name: 'Spine', description: 'The spine', mode: 'rail', bidirectional: false, segments: stubRoute.segments },
      })
      expect(createRoute).not.toHaveBeenCalled()
      expect(draft.savedCount.value).toBe(1)
      expect(draft.editing.value?.name).toBe('Spine')
      expect(draft.editing.value?.dependents).toEqual({ services: 0, user_services: 0, segments: 1 })
      expect(draft.hasChanges.value).toBe(false)
    })

    // A rename must not quietly re-vertex a route that was saved with every
    // point, and a shape still the one read keeps its segments.
    it('leaves a saved shape alone on a rename, simplify-on-save or not', async () => {
      vi.mocked(fetchMyRoute).mockResolvedValue(owned({ geometry: { type: 'LineString', coordinates: wobbly }, segments: [] }))
      const draft = useRouteDraft('main-line')
      await draft.start()
      expect(draft.simplifyNote.value).toBe('')
      expect(draft.hasChanges.value).toBe(false)
      draft.name.value = 'Spine'
      await draft.submit()
      expect((vi.mocked(updateRoute).mock.calls[0][1] as RouteInput).coordinates).toEqual(wobbly)
    })

    it('simplifies a reshaped route on save', async () => {
      const draft = useRouteDraft('main-line')
      await draft.start()
      draft.setCoordinates(wobbly)
      expect(draft.simplifyNote.value).toBe('5 points → 2 points on save')
      await draft.submit()
      const sent = vi.mocked(updateRoute).mock.calls[0][1] as RouteInput
      expect(sent.coordinates).toEqual([east(0), east(4)])
      expect(sent.properties.segments).toBeUndefined()
    })

    it('drops the segments once the shape they described has changed', async () => {
      const draft = useRouteDraft('main-line')
      await draft.start()
      draft.setCoordinates([...sfToSj, [-121.5, 37]])
      await draft.submit()
      const sent = vi.mocked(updateRoute).mock.calls[0][1] as RouteInput
      expect(sent.coordinates).toHaveLength(3)
      expect(sent.properties.segments).toBeUndefined()
    })

    describe('a route that lines are built on', () => {
      beforeEach(() => {
        vi.mocked(fetchMyRoute).mockResolvedValue(owned({ dependents: { services: 1, user_services: 1, segments: 0 } }))
      })

      it('locks the shape and says why', async () => {
        const draft = useRouteDraft('main-line')
        await draft.start()
        expect(draft.geometryLocked.value).toBe(true)
        expect(draft.inUseCount.value).toBe(2)
        expect(draft.geometryLockMessage.value).toBe(
          "Used by 2 lines — the shape can't change while lines are built on it. Name and details can.",
        )
      })

      it('ignores a new shape, imported or set, and never sends one', async () => {
        const draft = useRouteDraft('main-line')
        await draft.start()
        expect(draft.importGeoJson(JSON.stringify({ type: 'LineString', coordinates: [[-1, 1], [-2, 2]] }))).toBe(false)
        draft.setCoordinates([[-1, 1], [-2, 2]])
        expect(draft.coordinates.value).toEqual(sfToSj)

        draft.name.value = 'Spine'
        await draft.submit()

        expect((vi.mocked(updateRoute).mock.calls[0][1] as RouteInput).coordinates).toEqual(sfToSj)
      })

      it('still words a 409 route_in_use the API answers with', async () => {
        vi.mocked(updateRoute).mockRejectedValue(
          new ApiError('PUT failed: 409', 409, 'route_in_use', { services: 1, user_services: 1, segments: 0 }),
        )
        const draft = useRouteDraft('main-line')
        await draft.start()
        draft.name.value = 'Spine'
        await draft.submit()
        expect(draft.submitError.value).toBe('Used by 2 lines. Move them to another route first.')
      })
    })

    it('treats a route whose use the API did not report as free to reshape', async () => {
      vi.mocked(fetchMyRoute).mockResolvedValue(owned({ dependents: undefined }))
      const draft = useRouteDraft('main-line')
      await draft.start()
      expect(draft.inUseCount.value).toBeNull()
      expect(draft.geometryLocked.value).toBe(false)
      expect(draft.geometryLockMessage.value).toBe('')
    })
  })
})
