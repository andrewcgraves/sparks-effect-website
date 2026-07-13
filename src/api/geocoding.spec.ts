import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSuggestions, type GeocodingSuggestion } from './geocoding'

describe('fetchSuggestions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
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

  describe('Stadia provider (VITE_GEOCODING_API_KEY set)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_GEOCODING_API_KEY', 'test-api-key')
    })

    it('maps Stadia API features to GeocodingSuggestion objects with lat and lng', async () => {
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

    it('returns an empty array when the Stadia response has no features', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ features: [] }),
      }
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

      const results = await fetchSuggestions('xyzzy')
      expect(results).toEqual([])
    })

    it('returns an empty array on a non-ok Stadia response', async () => {
      const mockResponse = { ok: false, status: 429 }
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

      const results = await fetchSuggestions('Portland')
      expect(results).toEqual([])
    })

    it('returns an empty array when Stadia fetch throws', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

      const results = await fetchSuggestions('Portland')
      expect(results).toEqual([])
    })

    it('includes the query text and api_key in the Stadia request URL', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ features: [] }),
      }
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

      await fetchSuggestions('Chicago')

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
      expect(calledUrl).toContain('Chicago')
      expect(calledUrl).toContain('test-api-key')
    })
  })

  describe('Nominatim provider (no VITE_GEOCODING_API_KEY)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_GEOCODING_API_KEY', '')
    })

    it('calls the nominatim.openstreetmap.org search endpoint', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [],
      }
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

      await fetchSuggestions('Portland')

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
      expect(calledUrl).toContain('nominatim.openstreetmap.org')
      expect(calledUrl).toContain('Portland')
    })

    it('maps Nominatim response to GeocodingSuggestion objects', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [
          { display_name: 'Portland, Multnomah County, Oregon, United States', lat: '45.5231', lon: '-122.6784' },
          { display_name: 'Portland, Cumberland County, Maine, United States', lat: '43.6591', lon: '-70.2553' },
        ],
      }
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

      const results = await fetchSuggestions('Portland')

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual<GeocodingSuggestion>({
        label: 'Portland, Multnomah County, Oregon, United States',
        lat: 45.5231,
        lng: -122.6784,
      })
      expect(results[1]).toEqual<GeocodingSuggestion>({
        label: 'Portland, Cumberland County, Maine, United States',
        lat: 43.6591,
        lng: -70.2553,
      })
    })

    it('returns an empty array on a non-ok Nominatim response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      const results = await fetchSuggestions('Portland')
      expect(results).toEqual([])
    })

    it('returns an empty array when Nominatim fetch throws', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
      const results = await fetchSuggestions('Portland')
      expect(results).toEqual([])
    })
  })
})
