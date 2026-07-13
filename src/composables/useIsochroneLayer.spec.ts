import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import { useIsochroneLayer, ISOCHRONE_SOURCE_ID, ISOCHRONE_LAYER_ID } from './useIsochroneLayer'
import { isochroneGeoJSON } from '../fixtures/isochrone'

function makeMockMap(): Pick<Map, 'addSource' | 'addLayer'> {
  return {
    addSource: vi.fn(),
    addLayer: vi.fn(),
  }
}

describe('useIsochroneLayer', () => {
  it('registers a geojson source with the fixture data', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, isochroneGeoJSON)
    expect(map.addSource).toHaveBeenCalledOnce()
    expect(map.addSource).toHaveBeenCalledWith(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: isochroneGeoJSON,
    })
  })

  it('adds a fill layer referencing the isochrone source', () => {
    const map = makeMockMap()
    useIsochroneLayer(map as Map, isochroneGeoJSON)
    expect(map.addLayer).toHaveBeenCalledOnce()
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ISOCHRONE_LAYER_ID,
        type: 'fill',
        source: ISOCHRONE_SOURCE_ID,
      }),
    )
  })

  it('fixture contains three contour features', () => {
    expect(isochroneGeoJSON.features).toHaveLength(3)
    const contours = isochroneGeoJSON.features.map((f) => f.properties?.contour)
    expect(contours).toEqual(expect.arrayContaining([5, 10, 15]))
  })
})
