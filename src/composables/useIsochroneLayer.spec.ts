import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import {
  useIsochroneLayer,
  isochroneLegend,
  isochroneEgressOpacity,
  isochroneOriginOpacity,
  isochroneHighlightData,
  showIsochroneHighlight,
  flattenEgress,
  egressStationSlugs,
  ISOCHRONE_SOURCE_ID,
  ISOCHRONE_HIGHLIGHT_SOURCE_ID,
  ISOCHRONE_ORIGIN_LAYER_ID,
  ISOCHRONE_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
  ISOCHRONE_FILL_OPACITY,
  ISOCHRONE_HIGHLIGHT_OPACITY,
  ISOCHRONE_DIM_OPACITY,
  ISOCHRONE_ORIGIN_DIM_OPACITY,
} from './useIsochroneLayer'
import { THEME_TOKEN_FALLBACKS } from '../themeTokens'
import { staticIsochroneResponse } from '../test/sampleIsochrone'

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
  it('registers a geojson source with the fixture data, its station polygons merged', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse)
    expect(map.addSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: flattenEgress(staticIsochroneResponse),
    })
  })

  it('registers an empty source of its own for the highlighted station', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse)
    expect(map.addSource).toHaveBeenCalledWith(ISOCHRONE_HIGHLIGHT_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  })

  // SPA-524, SPA-526: one merged shape, so the GPU blends the core once, not once per station.
  it('merges the station polygons into one egress shape', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, staticIsochroneResponse)
    const data = (map.addSource as ReturnType<typeof vi.fn>).mock.calls
      .find(([id]) => id === ISOCHRONE_SOURCE_ID)?.[1].data as FeatureCollection
    const egress = data.features.filter((f) => f.properties?.['source'] === 'egress')
    expect(egress).toHaveLength(1)
    expect(egress[0]?.geometry.type).toBe('MultiPolygon')
    expect(data.features.filter((f) => f.properties?.['source'] === 'origin')).toHaveLength(1)
  })

  // The fill is painted from feature properties, not from metadata.mode, so a
  // fourth mode is just another string on the plot — the same layers, the same
  // origin/egress split.
  it('paints a transit-mode plot the same way as any other mode', () => {
    const transit = {
      ...staticIsochroneResponse,
      metadata: { ...staticIsochroneResponse.metadata, mode: 'transit' },
    }
    const map = makeMockMap()
    useIsochroneLayer(map as Map, transit)
    expect(map.addSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: flattenEgress(transit),
    })
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_ORIGIN_LAYER_ID, type: 'fill' }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: ISOCHRONE_LAYER_ID, type: 'fill' }),
    )
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

  // A per-feature fill-opacity expression can't reorder features within one
  // layer, so promoting a highlighted station above its overlapping
  // neighbours (SPA-211) needs a second layer painted on top. It reads from a
  // source holding only that station: a filter on the full source rebuilt
  // every splash-zone tile on each hover (SPA-524).
  describe('highlight layer', () => {
    it('adds a second fill layer on the highlight source, with no filter to change', () => {
      const map = makeMockMap()
      useIsochroneLayer(map as Map, staticIsochroneResponse)
      const fill = addedLayer(map, ISOCHRONE_HIGHLIGHT_LAYER_ID)
      expect(fill).toMatchObject({ type: 'fill', source: ISOCHRONE_HIGHLIGHT_SOURCE_ID })
      expect(fill.filter).toBeUndefined()
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

    // The fills differ only by a blend where they overlap, which is not much
    // to go on over a full-map origin wash — the outline is what says which
    // polygon was singled out (SPA-224).
    it('strokes the highlighted polygon with a line layer above the highlight fill', () => {
      const map = makeMockMap()
      useIsochroneLayer(map as Map, staticIsochroneResponse, { origin: '#111111', egress: '#222222' })
      const outline = addedLayer(map, ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID)
      expect(outline).toMatchObject({
        type: 'line',
        source: ISOCHRONE_HIGHLIGHT_SOURCE_ID,
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

  it('names both reach areas in one row, since they share a colour', () => {
    expect(isochroneLegend()).toEqual([{ source: 'origin', label: 'Reachable in time' }])
  })

  it('names the unfinished leg only when one is on the map', () => {
    expect(isochroneLegend().map((e) => e.source)).not.toContain('unfinished')
    expect(isochroneLegend({ unfinished: true }).find((e) => e.source === 'unfinished')).toEqual({
      source: 'unfinished',
      label: 'Travel time ran out here',
    })
  })

  it('names the starter walk as one trip\'s first leg, only when it is drawn', () => {
    expect(isochroneLegend().map((e) => e.source)).not.toContain('starter')
    expect(isochroneLegend({ starterWalk: true }).find((e) => e.source === 'starter')).toEqual({
      source: 'starter',
      label: 'First leg — nearest station',
    })
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

  describe('isochroneHighlightData', () => {
    it('holds nothing when no station is highlighted', () => {
      expect(isochroneHighlightData(staticIsochroneResponse, null).features).toEqual([])
    })

    it('holds only the highlighted station\'s egress polygon', () => {
      const { features } = isochroneHighlightData(staticIsochroneResponse, 'sf')
      expect(features.length).toBeGreaterThan(0)
      for (const f of features) expect(f.properties).toMatchObject({ source: 'egress', station_slug: 'sf' })
    })
  })

  describe('showIsochroneHighlight', () => {
    function attachedMap() {
      const setData = vi.fn()
      const map = { ...makeMockMap(), getSource: vi.fn().mockReturnValue({ setData }) }
      useIsochroneLayer(map as unknown as Map, staticIsochroneResponse)
      return { map: map as unknown as Map, setData }
    }

    it('puts the station\'s polygon in the highlight source', () => {
      const { map, setData } = attachedMap()
      showIsochroneHighlight(map, 'sf')
      expect(setData).toHaveBeenCalledWith(isochroneHighlightData(staticIsochroneResponse, 'sf'))
    })

    // Every sync of the page's hover state calls through here; resending the
    // same polygon would send the worker the same tile work again.
    it('sends nothing when the highlighted station has not changed', () => {
      const { map, setData } = attachedMap()
      showIsochroneHighlight(map, 'sf')
      showIsochroneHighlight(map, 'sf')
      expect(setData).toHaveBeenCalledOnce()
    })

    it('does nothing on a map with no splash zone attached', () => {
      const getSource = vi.fn()
      showIsochroneHighlight({ getSource } as unknown as Map, 'sf')
      expect(getSource).not.toHaveBeenCalled()
    })
  })

  describe('flattenEgress', () => {
    it('keeps a plot with one egress polygon as it is', () => {
      const one: FeatureCollection = {
        type: 'FeatureCollection',
        features: staticIsochroneResponse.features.filter((f) => f.properties.station_slug === 'sf' || f.properties.source === 'origin'),
      }
      expect(flattenEgress(one)).toBe(one)
    })

    it('keeps the plot\'s metadata', () => {
      expect(flattenEgress(staticIsochroneResponse)).toMatchObject({ metadata: staticIsochroneResponse.metadata })
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
