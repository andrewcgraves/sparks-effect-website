import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import {
  useIsochroneLayer,
  isochroneLegend,
  isochroneEgressOpacity,
  isochroneOriginOpacity,
  isochroneHighlightFilter,
  egressStationSlugs,
  ISOCHRONE_SOURCE_ID,
  ISOCHRONE_ORIGIN_LAYER_ID,
  ISOCHRONE_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
  ISOCHRONE_FILL_OPACITY,
  ISOCHRONE_HIGHLIGHT_OPACITY,
  ISOCHRONE_DIM_OPACITY,
  ISOCHRONE_ORIGIN_DIM_OPACITY,
} from './useIsochroneLayer'
import { ROUTE_LINE_LAYER_ID } from './useRouteLayer'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'
import { staticIsochroneResponse } from '../fixtures/isochrone'

function makeMockMap(): Pick<Map, 'addSource' | 'addLayer' | 'getLayer'> {
  return {
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getLayer: vi.fn().mockReturnValue(undefined),
  }
}

function addedLayer(map: Pick<Map, 'addLayer'>, id: string) {
  const calls = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls
  return calls.find(([layer]) => layer.id === id)?.[0]
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
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ISOCHRONE_LAYER_ID,
        type: 'fill',
        source: ISOCHRONE_SOURCE_ID,
      }),
    )
  })

  it('adds the fill layer with no beforeId when the route line does not exist yet', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse)
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_LAYER_ID }),
    )
  })

  // SPA-213: routes/stations are drawn from the scenario fetch well before the
  // isochrone is generated, so without stacking under the route line on
  // purpose the fill would paint over them the moment it attaches.
  it('inserts the fill layer below the route line when it already exists', () => {
    const map = makeMockMap()
    ;(map.getLayer as ReturnType<typeof vi.fn>).mockReturnValue({ id: ROUTE_LINE_LAYER_ID })
    useIsochroneLayer(map as Map, staticIsochroneResponse)
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_LAYER_ID }),
      ROUTE_LINE_LAYER_ID,
    )
  })

  // A per-feature fill-opacity expression can't reorder features within one
  // layer, so promoting a highlighted station above its overlapping
  // neighbours (SPA-211) needs a second, filtered layer painted on top.
  describe('highlight layer', () => {
    it('adds a second fill layer on the same source, filtered to match nothing initially', () => {
      const map = makeMockMap()
      useIsochroneLayer(map as Map, staticIsochroneResponse)
      expect(map.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ISOCHRONE_HIGHLIGHT_LAYER_ID,
          type: 'fill',
          source: ISOCHRONE_SOURCE_ID,
          filter: isochroneHighlightFilter(null),
        }),
      )
    })

    it('paints the highlight layer with the egress colour at the highlight opacity, not the base opacity', () => {
      const map = makeMockMap()
      useIsochroneLayer(map as Map, staticIsochroneResponse, { origin: '#111111', egress: '#222222' })
      const call = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.find(
        ([layer]) => layer.id === ISOCHRONE_HIGHLIGHT_LAYER_ID,
      )
      expect(call?.[0].paint).toEqual({ 'fill-color': '#222222', 'fill-opacity': ISOCHRONE_HIGHLIGHT_OPACITY })
    })

    it('is added after the base layer, so it stacks above it', () => {
      const map = makeMockMap()
      useIsochroneLayer(map as Map, staticIsochroneResponse)
      const calls = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.map(([layer]) => layer.id)).toEqual([
        ISOCHRONE_ORIGIN_LAYER_ID,
        ISOCHRONE_LAYER_ID,
        ISOCHRONE_HIGHLIGHT_LAYER_ID,
        ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
      ])
    })

    it('stacks below the route line when one already exists, same as the base layer', () => {
      const map = makeMockMap()
      ;(map.getLayer as ReturnType<typeof vi.fn>).mockReturnValue({ id: ROUTE_LINE_LAYER_ID })
      useIsochroneLayer(map as Map, staticIsochroneResponse)
      expect(map.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: ISOCHRONE_HIGHLIGHT_LAYER_ID }),
        ROUTE_LINE_LAYER_ID,
      )
    })

    // The fills differ only by a blend where they overlap, which is not much
    // to go on over a full-map origin wash — the outline is what says which
    // polygon was singled out (SPA-224).
    it('strokes the highlighted polygon with a line layer above the highlight fill', () => {
      const map = makeMockMap()
      useIsochroneLayer(map as Map, staticIsochroneResponse, { origin: '#111111', egress: '#222222' })
      const outline = addedLayer(map, ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID)
      expect(outline).toMatchObject({
        type: 'line',
        source: ISOCHRONE_SOURCE_ID,
        filter: isochroneHighlightFilter(null),
        paint: { 'line-color': '#222222', 'line-width': 2 },
      })
    })
  })

  // SPA-224: origin and egress used to share one fill layer, which left their
  // stacking to the order the worker emitted features in. Separate layers,
  // each filtered to its own source, is what makes the blue reliably sit
  // under the orange.
  describe('origin layer', () => {
    it('adds the origin fill below the egress fill, filtered to origin features', () => {
      const map = makeMockMap()
      useIsochroneLayer(map as Map, staticIsochroneResponse)
      expect(addedLayer(map, ISOCHRONE_ORIGIN_LAYER_ID)).toMatchObject({
        type: 'fill',
        source: ISOCHRONE_SOURCE_ID,
        filter: ['==', ['get', 'source'], 'origin'],
      })
      const ids = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.map(([layer]) => layer.id)
      expect(ids.indexOf(ISOCHRONE_ORIGIN_LAYER_ID)).toBeLessThan(ids.indexOf(ISOCHRONE_LAYER_ID))
    })

    it('filters the egress fill to egress features, so it never paints the origin polygon', () => {
      const map = makeMockMap()
      useIsochroneLayer(map as Map, staticIsochroneResponse)
      expect(addedLayer(map, ISOCHRONE_LAYER_ID)).toMatchObject({
        filter: ['==', ['get', 'source'], 'egress'],
      })
    })

    it('stacks below the route line when one already exists, same as the rest', () => {
      const map = makeMockMap()
      ;(map.getLayer as ReturnType<typeof vi.fn>).mockReturnValue({ id: ROUTE_LINE_LAYER_ID })
      useIsochroneLayer(map as Map, staticIsochroneResponse)
      for (const id of [ISOCHRONE_ORIGIN_LAYER_ID, ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID]) {
        expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id }), ROUTE_LINE_LAYER_ID)
      }
    })
  })

  it('paints each fill with the flat colour of its own source, no match expression', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse)
    expect(addedLayer(map, ISOCHRONE_ORIGIN_LAYER_ID).paint['fill-color']).toBe(
      THEME_TOKEN_FALLBACKS['--color-data-origin'],
    )
    expect(addedLayer(map, ISOCHRONE_LAYER_ID).paint['fill-color']).toBe(
      THEME_TOKEN_FALLBACKS['--color-data-egress'],
    )
  })

  it('paints with caller-supplied colours resolved from the CSS tokens', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse, { origin: '#111111', egress: '#222222' })
    expect(addedLayer(map, ISOCHRONE_ORIGIN_LAYER_ID).paint['fill-color']).toBe('#111111')
    expect(addedLayer(map, ISOCHRONE_LAYER_ID).paint['fill-color']).toBe('#222222')
  })

  it('legend labels carry the same colours the fills are painted with', () => {
    const legend = isochroneLegend({ origin: '#111111', egress: '#222222' })
    expect(legend.map((e) => [e.source, e.color])).toEqual([
      ['origin', '#111111'],
      ['egress', '#222222'],
    ])
  })

  it('fixture names the compiled graph it was plotted over', () => {
    expect(staticIsochroneResponse.metadata.compile_job_id).toBe('0f3b7c2a-4d1e-4a5b-9c8d-2e6f1a0b3c4d')
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

  describe('layer opacities', () => {
    it('are the shared default when nothing is dimmed', () => {
      expect(isochroneEgressOpacity(false)).toBe(ISOCHRONE_FILL_OPACITY)
      expect(isochroneOriginOpacity(false)).toBe(ISOCHRONE_FILL_OPACITY)
    })

    it('dims every egress polygon out of the highlighted one\'s way', () => {
      expect(isochroneEgressOpacity(true)).toBe(ISOCHRONE_DIM_OPACITY)
    })

    // SPA-224: the origin used to hold its full opacity while a station was
    // highlighted, and a full-map driving plot's blue wash left the promoted
    // orange reading as a muted tan.
    it('dims the origin fill too, but less far, so the rider keeps their own reach in view', () => {
      expect(isochroneOriginOpacity(true)).toBe(ISOCHRONE_ORIGIN_DIM_OPACITY)
      expect(ISOCHRONE_ORIGIN_DIM_OPACITY).toBeLessThan(ISOCHRONE_FILL_OPACITY)
      expect(ISOCHRONE_ORIGIN_DIM_OPACITY).toBeGreaterThan(ISOCHRONE_DIM_OPACITY)
    })
  })

  describe('egressStationSlugs', () => {
    it('is empty when there is no plot', () => {
      expect(egressStationSlugs(null).size).toBe(0)
    })

    it('lists every station the plot drew a polygon for, and no origin feature', () => {
      expect([...egressStationSlugs(staticIsochroneResponse)].sort()).toEqual(
        ['gilroy', 'millbrae', 'san-jose', 'sf'],
      )
    })

    // A station can be lit as reachable and still have no polygon; that is the
    // case that used to dim the whole map and promote nothing (SPA-224).
    it('leaves out a station with no egress polygon of its own', () => {
      expect(egressStationSlugs(staticIsochroneResponse).has('fresno')).toBe(false)
    })

    it('ignores an egress feature with no usable station_slug', () => {
      const slugs = egressStationSlugs({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { source: 'egress' }, geometry: { type: 'Polygon', coordinates: [] } },
          { type: 'Feature', properties: { source: 'egress', station_slug: '' }, geometry: { type: 'Polygon', coordinates: [] } },
          { type: 'Feature', properties: { source: 'egress', station_slug: 'sf' }, geometry: { type: 'Polygon', coordinates: [] } },
        ],
      })
      expect([...slugs]).toEqual(['sf'])
    })
  })

  describe('isochroneHighlightFilter', () => {
    it('matches no feature when nothing is highlighted', () => {
      expect(isochroneHighlightFilter(null)).toEqual(['in', ['get', 'station_slug'], ['literal', []]])
    })

    it('matches only the highlighted station', () => {
      expect(isochroneHighlightFilter('sf')).toEqual(['==', ['get', 'station_slug'], 'sf'])
    })
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
