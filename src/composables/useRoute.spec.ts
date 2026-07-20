import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useRoute } from './useRoute'
import type { Route } from '../api/authoring'

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

describe('useRoute', () => {
  beforeEach(() => {
    vi.mocked(fetchRoute).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls fetchRoute with the given slug', () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    useRoute('main-line')
    expect(fetchRoute).toHaveBeenCalledWith('main-line')
  })

  it('starts loading with no route and not found', () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    const { route, loading, notFound } = useRoute('main-line')
    expect(route.value).toBeNull()
    expect(loading.value).toBe(true)
    expect(notFound.value).toBe(false)
  })

  it('populates the route and stops loading once the fetch resolves', async () => {
    vi.mocked(fetchRoute).mockResolvedValueOnce(stubRoute)
    const { route, loading } = useRoute('main-line')
    await flushPromises()
    expect(route.value).toEqual(stubRoute)
    expect(loading.value).toBe(false)
  })

  it('sets notFound and stops loading when the fetch rejects', async () => {
    vi.mocked(fetchRoute).mockRejectedValueOnce(new Error('404'))
    const { route, loading, notFound } = useRoute('no-such-route')
    await flushPromises()
    expect(notFound.value).toBe(true)
    expect(route.value).toBeNull()
    expect(loading.value).toBe(false)
  })
})
