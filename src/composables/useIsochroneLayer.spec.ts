import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import {
  useIsochroneLayer,
  isochroneLegend,
  ISOCHRONE_SOURCE_ID,
  ISOCHRONE_LAYER_ID,
} from './useIsochroneLayer'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'
import { staticIsochroneResponse } from '../fixtures/isochrone'

function makeMockMap(): Pick<Map, 'addSource' | 'addLayer'> {
  return {
    addSource: vi.fn(),
    addLayer: vi.fn(),
  }
}

describe('useIsochroneLayer', () => {
  it('registers a geojson source with the fixture data', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse)
    expect(map.addSource).toHaveBeenCalledOnce()
    expect(map.addSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: staticIsochroneResponse,
    })
  })

  it('adds a fill layer referencing the isochrone source', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse)
    expect(map.addLayer).toHaveBeenCalledOnce()
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ISOCHRONE_LAYER_ID,
        type: 'fill',
        source: ISOCHRONE_SOURCE_ID,
      }),
    )
  })

  it('paint uses a source-based match expression for fill-color', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse)
    const layerArg = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const fillColor = layerArg.paint['fill-color']
    expect(Array.isArray(fillColor)).toBe(true)
    expect(fillColor[0]).toBe('match')
    expect(fillColor[1]).toEqual(['get', 'source'])
    expect(fillColor[2]).toBe('origin')
    expect(fillColor[3]).toBe(THEME_TOKEN_FALLBACKS['--color-data-origin'])
    expect(fillColor[4]).toBe(THEME_TOKEN_FALLBACKS['--color-data-egress'])
  })

  it('paints with caller-supplied colours resolved from the CSS tokens', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse, { origin: '#111111', egress: '#222222' })
    const layerArg = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(layerArg.paint['fill-color']).toEqual(
      ['match', ['get', 'source'], 'origin', '#111111', '#222222'],
    )
  })

  it('legend labels carry the same colours the fills are painted with', () => {
    const legend = isochroneLegend({ origin: '#111111', egress: '#222222' })
    expect(legend.map((e) => [e.source, e.color])).toEqual([
      ['origin', '#111111'],
      ['egress', '#222222'],
    ])
  })

  it('fixture has metadata with ca-hsr scenario_slug', () => {
    expect(staticIsochroneResponse.metadata.scenario_slug).toBe('ca-hsr')
  })

  it('fixture metadata lists reachable stations from the sample response', () => {
    const slugs = staticIsochroneResponse.metadata.reachable_stations.map((s) => s.station_slug)
    expect(slugs).toEqual(expect.arrayContaining(['sf', 'millbrae', 'san-jose', 'gilroy']))
  })

  it('fixture features all have a source property', () => {
    for (const f of staticIsochroneResponse.features) {
      expect(['origin', 'egress']).toContain(f.properties.source)
    }
  })

  it('egress features include station_slug and remaining_mins', () => {
    const egresses = staticIsochroneResponse.features.filter((f) => f.properties.source === 'egress')
    expect(egresses.length).toBeGreaterThanOrEqual(1)
    for (const f of egresses) {
      expect(typeof f.properties.station_slug).toBe('string')
      expect(f.properties.station_slug?.length).toBeGreaterThan(0)
      expect(typeof f.properties.remaining_mins).toBe('number')
    }
  })

  it('fixture has exactly one origin feature and at least one egress feature', () => {
    const origins = staticIsochroneResponse.features.filter((f) => f.properties.source === 'origin')
    const egresses = staticIsochroneResponse.features.filter((f) => f.properties.source === 'egress')
    expect(origins).toHaveLength(1)
    expect(egresses.length).toBeGreaterThanOrEqual(1)
  })

  it('fixture polygon coordinates are in the CA HSR Bay Area corridor', () => {
    for (const f of staticIsochroneResponse.features) {
      for (const ring of f.geometry.coordinates) {
        for (const [lng, lat] of ring) {
          expect(lng).toBeGreaterThan(-123)
          expect(lng).toBeLessThan(-121)
          expect(lat).toBeGreaterThan(36.5)
          expect(lat).toBeLessThan(38.5)
        }
      }
    }
  })
})
