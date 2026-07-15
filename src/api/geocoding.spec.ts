import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSuggestions, reverseGeocode, type GeocodingSuggestion } from './geocoding'

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

  it('returns an empty array when the Nominatim response has no results', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [],
    }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

    const results = await fetchSuggestions('xyzzy')
    expect(results).toEqual([])
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

describe('reverseGeocode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('calls the nominatim reverse endpoint with lat and lon', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        display_name: 'Portland, Multnomah County, Oregon, United States',
        lat: '45.5231',
        lon: '-122.6784',
      }),
    }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

    await reverseGeocode(45.5231, -122.6784)

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('nominatim.openstreetmap.org/reverse')
    expect(calledUrl).toContain('lat=45.5231')
    expect(calledUrl).toContain('lon=-122.6784')
    expect(calledUrl).toContain('format=jsonv2')
  })

  it('maps Nominatim reverse response to a GeocodingSuggestion', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        display_name: 'Portland, Multnomah County, Oregon, United States',
        lat: '45.5231',
        lon: '-122.6784',
      }),
    }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse as Response)

    const result = await reverseGeocode(45.5231, -122.6784)

    expect(result).toEqual<GeocodingSuggestion>({
      label: 'Portland, Multnomah County, Oregon, United States',
      lat: 45.5231,
      lng: -122.6784,
    })
  })

  it('returns null when the Nominatim response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response)

    const result = await reverseGeocode(45.5231, -122.6784)
    expect(result).toBeNull()
  })

  it('returns null when Nominatim fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

    const result = await reverseGeocode(45.5231, -122.6784)
    expect(result).toBeNull()
  })
})
