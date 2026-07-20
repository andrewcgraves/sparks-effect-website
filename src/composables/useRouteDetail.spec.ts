import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useRouteDetail } from './useRouteDetail'
import type { Route } from '../api/authoring'
import { ApiError } from '../api/authoring/client'

vi.mock('../api/authoring', () => ({
  fetchRoute: vi.fn(),
}))

import { fetchRoute } from '../api/authoring'

const stubRoute: Route = {
  id: 'rt1',
  slug: 'main-line',
  name: 'Main Line',
  mode: 'rail',
  bidirectional: true,
  geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
  segments: [
    { cant_mm: 150, curve_radius_m: 1200, grade_pct: 1.2 },
  ],
}

describe('useRouteDetail', () => {
  beforeEach(() => {
    vi.mocked(fetchRoute).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls fetchRoute with the given slug', () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    useRouteDetail('main-line')
    expect(fetchRoute).toHaveBeenCalledWith('main-line')
  })

  it('starts loading with no route and not found', () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    const { route, loading, notFound } = useRouteDetail('main-line')
    expect(route.value).toBeNull()
    expect(loading.value).toBe(true)
    expect(notFound.value).toBe(false)
  })

  it('populates the route and stops loading once the fetch resolves', async () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    const { route, loading } = useRouteDetail('main-line')
    await flushPromises()
    expect(route.value).toEqual(stubRoute)
    expect(loading.value).toBe(false)
  })

  it('sets notFound and stops loading on a 404', async () => {
    vi.mocked(fetchRoute).mockRejectedValueOnce(new ApiError('not found', 404))
    const { route, loading, notFound, error } = useRouteDetail('no-such-route')
    await flushPromises()
    expect(notFound.value).toBe(true)
    expect(error.value).toBe(false)
    expect(route.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('sets error, not notFound, on a non-404 failure', async () => {
    vi.mocked(fetchRoute).mockRejectedValueOnce(new ApiError('server error', 500))
    const { route, loading, notFound, error } = useRouteDetail('main-line')
    await flushPromises()
    expect(error.value).toBe(true)
    expect(notFound.value).toBe(false)
    expect(route.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('sets error, not notFound, on a network failure', async () => {
    vi.mocked(fetchRoute).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { notFound, error } = useRouteDetail('main-line')
    await flushPromises()
    expect(error.value).toBe(true)
    expect(notFound.value).toBe(false)
  })
})
