import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSuggestions, type GeocodingSuggestion } from './geocoding'

describe('fetchSuggestions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an empty array for an empty query', async () => {
    const results = await fetchSuggestions('')
    expect(results).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns an empty array for a whitespace-only query', async () => {
    const results = await fetchSuggestions('   ')
    expect(results).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('maps API features to GeocodingSuggestion objects with lat and lng', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        features: [
          {
            properties: { label: 'Portland, OR, USA' },
            geometry: { coordinates: [-122.6784, 45.5231] },
          },
          {
            properties: { label: 'Portland, ME, USA' },
            geometry: { coordinates: [-70.2553, 43.6591] },
          },
        ],
      }),
    }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

    const results = await fetchSuggestions('Portland')

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual<GeocodingSuggestion>({
      label: 'Portland, OR, USA',
      lat: 45.5231,
      lng: -122.6784,
    })
    expect(results[1]).toEqual<GeocodingSuggestion>({
      label: 'Portland, ME, USA',
      lat: 43.6591,
      lng: -70.2553,
    })
  })

  it('returns an empty array when the API response has no features', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ features: [] }),
    }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

    const results = await fetchSuggestions('xyzzy')
    expect(results).toEqual([])
  })

  it('returns an empty array on a non-ok HTTP response', async () => {
    const mockResponse = { ok: false, status: 429 }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

    const results = await fetchSuggestions('Portland')
    expect(results).toEqual([])
  })

  it('returns an empty array when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

    const results = await fetchSuggestions('Portland')
    expect(results).toEqual([])
  })

  it('includes the query text in the request URL', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ features: [] }),
    }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

    await fetchSuggestions('Chicago')

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('Chicago')
  })
})
