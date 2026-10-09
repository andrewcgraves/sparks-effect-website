// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GeocoderUnavailableError,
  fetchSuggestions,
  lookupPlace,
  reverseGeocode,
  type AddressMatch,
  type GeocodingSuggestion,
} from './geocoding'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function calledUrl(call = 0): URL {
  return new URL(String(vi.mocked(fetch).mock.calls[call][0]))
}

const diridonAutocomplete = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: null,
      properties: {
        gid: 'openstreetmap:venue:node/3646391919',
        layer: 'poi',
        name: 'San Jose Diridon',
        coarse_location: 'San Jose, CA, USA',
      },
    },
  ],
}

describe('fetchSuggestions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('searches Stadia autocomplete, limited to the US and a California–Nevada box', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(diridonAutocomplete))

    await fetchSuggestions('Diridon')

    const url = calledUrl()
    expect(url.origin + url.pathname).toBe('https://api.stadiamaps.com/geocoding/v2/autocomplete')
    expect(url.searchParams.get('text')).toBe('Diridon')
    expect(url.searchParams.get('size')).toBe('5')
    expect(url.searchParams.get('boundary.country')).toBe('US')
    expect(Number(url.searchParams.get('boundary.rect.min_lat'))).toBeLessThan(32.6)
    expect(Number(url.searchParams.get('boundary.rect.max_lat'))).toBeGreaterThan(41.9)
    expect(Number(url.searchParams.get('boundary.rect.min_lon'))).toBeLessThan(-124.3)
    expect(Number(url.searchParams.get('boundary.rect.max_lon'))).toBeGreaterThan(-114.1)
  })

  it('labels each match with its name and coarse location, and keeps its gid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(diridonAutocomplete))

    expect(await fetchSuggestions('Diridon')).toEqual<AddressMatch[]>([
      { label: 'San Jose Diridon, San Jose, CA, USA', gid: 'openstreetmap:venue:node/3646391919' },
    ])
  })

  it('returns no matches for a blank query without calling the provider', async () => {
    expect(await fetchSuggestions('   ')).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns an empty list when the provider finds nothing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ type: 'FeatureCollection', features: [] }))

    expect(await fetchSuggestions('xyzzy')).toEqual([])
  })

  it('sends no api_key when none is configured, leaving Stadia domain auth to identify the site', async () => {
    vi.stubEnv('VITE_STADIA_API_KEY', '')
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(diridonAutocomplete))

    await fetchSuggestions('Diridon')

    expect(calledUrl().searchParams.has('api_key')).toBe(false)
  })

  it('sends the api_key when one is configured', async () => {
    vi.stubEnv('VITE_STADIA_API_KEY', 'preview-key')
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(diridonAutocomplete))

    await fetchSuggestions('Diridon')

    expect(calledUrl().searchParams.get('api_key')).toBe('preview-key')
  })

  it.each([500, 429, 401])('reports the provider as unavailable on HTTP %i, not as "no results"', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'nope' }, status))

    await expect(fetchSuggestions('Diridon')).rejects.toBeInstanceOf(GeocoderUnavailableError)
  })

  it('reports the provider as unavailable when a 200 carries something other than a FeatureCollection', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]))
    await expect(fetchSuggestions('Diridon')).rejects.toBeInstanceOf(GeocoderUnavailableError)

    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>gateway</html>', { status: 200 }))
    await expect(fetchSuggestions('Diridon')).rejects.toBeInstanceOf(GeocoderUnavailableError)
  })

  it('reports the provider as unavailable when the request never completes', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(fetchSuggestions('Diridon')).rejects.toBeInstanceOf(GeocoderUnavailableError)
  })

  it('passes the abort signal to fetch and lets a cancelled search reject as an abort', async () => {
    const controller = new AbortController()
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      expect(init?.signal).toBe(controller.signal)
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
    })
    controller.abort()

    const failure = await fetchSuggestions('Diridon', controller.signal).catch((e: unknown) => e)
    expect(failure).not.toBeInstanceOf(GeocoderUnavailableError)
    expect((failure as DOMException).name).toBe('AbortError')
  })
})

const diridonPlace = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-121.902496, 37.32992] },
      properties: {
        gid: 'openstreetmap:venue:node/3646391919',
        layer: 'poi',
        name: 'San Jose Diridon',
        coarse_location: 'San Jose, CA, USA',
        formatted_address_line: 'San Jose Diridon, 65 Cahill Street, San Jose, California 95110, United States of America',
      },
    },
  ],
}

const diridonMatch: AddressMatch = {
  label: 'San Jose Diridon, San Jose, CA, USA',
  gid: 'openstreetmap:venue:node/3646391919',
}

describe('lookupPlace', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the chosen match by gid from Stadia place details', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(diridonPlace))

    await lookupPlace(diridonMatch)

    const url = calledUrl()
    expect(url.origin + url.pathname).toBe('https://api.stadiamaps.com/geocoding/v2/place_details')
    expect(url.searchParams.get('ids')).toBe('openstreetmap:venue:node/3646391919')
  })

  it('returns the match under the label the user picked, at the place’s coordinates', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(diridonPlace))

    expect(await lookupPlace(diridonMatch)).toEqual<GeocodingSuggestion>({
      label: 'San Jose Diridon, San Jose, CA, USA',
      lat: 37.32992,
      lng: -121.902496,
    })
  })

  it('reports the provider as unavailable when it fails or returns no geometry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'quota' }, 429))
    await expect(lookupPlace(diridonMatch)).rejects.toBeInstanceOf(GeocoderUnavailableError)

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ type: 'FeatureCollection', features: [] }))
    await expect(lookupPlace(diridonMatch)).rejects.toBeInstanceOf(GeocoderUnavailableError)
  })
})

describe('reverseGeocode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks Stadia reverse for the single nearest place to the point', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(diridonPlace))

    await reverseGeocode(37.3297, -121.9024)

    const url = calledUrl()
    expect(url.origin + url.pathname).toBe('https://api.stadiamaps.com/geocoding/v2/reverse')
    expect(url.searchParams.get('point.lat')).toBe('37.3297')
    expect(url.searchParams.get('point.lon')).toBe('-121.9024')
    expect(url.searchParams.get('size')).toBe('1')
  })

  it('labels the nearest place and returns its coordinates', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(diridonPlace))

    expect(await reverseGeocode(37.3297, -121.9024)).toEqual<GeocodingSuggestion>({
      label: 'San Jose Diridon, San Jose, CA, USA',
      lat: 37.32992,
      lng: -121.902496,
    })
  })

  it('returns null when nothing is near the point', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ type: 'FeatureCollection', features: [] }))

    expect(await reverseGeocode(0, 0)).toBeNull()
  })

  it('returns null when the provider fails, so the caller keeps the coordinates without a name', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 500))
    expect(await reverseGeocode(37.3297, -121.9024)).toBeNull()

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await reverseGeocode(37.3297, -121.9024)).toBeNull()
  })
})
