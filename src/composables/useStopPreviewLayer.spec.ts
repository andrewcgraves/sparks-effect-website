import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import {
  useStopPreviewLayer,
  RAW_STOP_SOURCE_ID,
  RAW_STOP_LAYER_ID,
  SNAPPED_STOP_SOURCE_ID,
  SNAPPED_STOP_LAYER_ID,
  LEADER_SOURCE_ID,
  LEADER_LAYER_ID,
} from './useStopPreviewLayer'
import type { StopPreviewPair } from './useStopPreviewLayer'

function makeMockMap() {
  const sources: Record<string, { setData: ReturnType<typeof vi.fn> }> = {}
  const addSource = vi.fn((id: string) => {
    sources[id] = { setData: vi.fn() }
  })
  const getSource = vi.fn((id: string) => sources[id])
  return {
    addSource,
    addLayer: vi.fn(),
    getSource,
    sources,
  }
}

const pairWithSnap: StopPreviewPair = {
  id: 'a',
  raw: { lat: 37.77, lng: -122.41 },
  snapped: { lat: 37.771, lng: -122.409 },
  offRoute: false,
}

const pairOffRoute: StopPreviewPair = {
  id: 'b',
  raw: { lat: 38.5, lng: -123.5 },
  snapped: { lat: 37.9, lng: -122.5 },
  offRoute: true,
}

const pairWithoutSnap: StopPreviewPair = {
  id: 'c',
  raw: { lat: 37.5, lng: -122.0 },
  snapped: null,
}

describe('useStopPreviewLayer', () => {
  it('adds sources and layers for raw pins, snapped pins, and leader lines', () => {
    const map = makeMockMap()
    useStopPreviewLayer(map as unknown as Map)

    expect(map.addSource).toHaveBeenCalledWith(RAW_STOP_SOURCE_ID, expect.objectContaining({ type: 'geojson' }))
    expect(map.addSource).toHaveBeenCalledWith(SNAPPED_STOP_SOURCE_ID, expect.objectContaining({ type: 'geojson' }))
    expect(map.addSource).toHaveBeenCalledWith(LEADER_SOURCE_ID, expect.objectContaining({ type: 'geojson' }))

    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: RAW_STOP_LAYER_ID, type: 'circle', source: RAW_STOP_SOURCE_ID }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: SNAPPED_STOP_LAYER_ID, type: 'circle', source: SNAPPED_STOP_SOURCE_ID }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: LEADER_LAYER_ID, type: 'line', source: LEADER_SOURCE_ID }),
    )
  })

  it('update() renders a raw pin feature for every pair, snapped or not', () => {
    const map = makeMockMap()
    const layer = useStopPreviewLayer(map as unknown as Map)
    layer.update([pairWithSnap, pairWithoutSnap])

    const data = map.sources[RAW_STOP_SOURCE_ID].setData.mock.calls[0][0]
    expect(data.features).toHaveLength(2)
    expect(data.features[0].geometry.coordinates).toEqual([-122.41, 37.77])
  })

  it('update() renders a snapped pin only for pairs with a snap result', () => {
    const map = makeMockMap()
    const layer = useStopPreviewLayer(map as unknown as Map)
    layer.update([pairWithSnap, pairWithoutSnap])

    const data = map.sources[SNAPPED_STOP_SOURCE_ID].setData.mock.calls[0][0]
    expect(data.features).toHaveLength(1)
    expect(data.features[0].geometry.coordinates).toEqual([-122.409, 37.771])
  })

  it('update() draws a leader line between raw and snapped for snapped pairs only', () => {
    const map = makeMockMap()
    const layer = useStopPreviewLayer(map as unknown as Map)
    layer.update([pairWithSnap, pairWithoutSnap])

    const data = map.sources[LEADER_SOURCE_ID].setData.mock.calls[0][0]
    expect(data.features).toHaveLength(1)
    expect(data.features[0].geometry.coordinates).toEqual([
      [-122.41, 37.77],
      [-122.409, 37.771],
    ])
  })

  it('tags off-route pairs on both the snapped pin and the leader line', () => {
    const map = makeMockMap()
    const layer = useStopPreviewLayer(map as unknown as Map)
    layer.update([pairWithSnap, pairOffRoute])

    const snappedData = map.sources[SNAPPED_STOP_SOURCE_ID].setData.mock.calls[0][0]
    const leaderData = map.sources[LEADER_SOURCE_ID].setData.mock.calls[0][0]
    expect(snappedData.features.find((f: { properties: { id: string } }) => f.properties.id === 'b').properties.offRoute).toBe(true)
    expect(leaderData.features.find((f: { properties: { id: string } }) => f.properties.id === 'b').properties.offRoute).toBe(true)
    expect(snappedData.features.find((f: { properties: { id: string } }) => f.properties.id === 'a').properties.offRoute).toBe(false)
  })

  it('handles an empty pair list without error', () => {
    const map = makeMockMap()
    const layer = useStopPreviewLayer(map as unknown as Map)
    expect(() => layer.update([])).not.toThrow()
    expect(map.sources[RAW_STOP_SOURCE_ID].setData.mock.calls[0][0].features).toHaveLength(0)
  })
})
