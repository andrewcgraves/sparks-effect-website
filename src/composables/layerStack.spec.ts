import { describe, expect, it, vi } from 'vitest'
import type { AddLayerObject, Map } from 'maplibre-gl'
import { addLayerInStack, layerAboveInStack, layerStack } from './layerStack'
import {
  ISOCHRONE_HIGHLIGHT_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
  ISOCHRONE_LAYER_ID,
  ISOCHRONE_ORIGIN_LAYER_ID,
} from './useIsochroneLayer'
import { ORIGIN_WALK_LAYER_ID } from './useOriginWalkLayer'
import {
  PROGRESS_CAP_HIT_LAYER_ID,
  PROGRESS_CAP_LAYER_ID,
  PROGRESS_LINE_LAYER_ID,
  RIDDEN_LINE_LAYER_ID,
  ROUTE_LINE_LAYER_ID,
  STATION_DOTS_LAYER_ID,
} from './useRouteLayer'
import {
  LEADER_LAYER_ID,
  RAW_STOP_LAYER_ID,
  SNAPPED_STOP_LAYER_ID,
} from './useStopPreviewLayer'
import {
  RAIL_CONSTRUCTION_LAYER_ID,
  RAIL_EXISTING_LAYER_ID,
  RAIL_PROPOSED_LAYER_ID,
  ROUTE_EDITOR_LAYER_IDS,
} from './railLayerIds'

function spec(id: string): AddLayerObject {
  return { id, type: 'fill', source: 'src' }
}

function paintMap() {
  const ids: string[] = []
  const map = {
    ids,
    getLayer: (id: string) => (ids.includes(id) ? { id } : undefined),
    addLayer: vi.fn((layer: { id: string }, beforeId?: string) => {
      if (beforeId) ids.splice(ids.indexOf(beforeId), 0, layer.id)
      else ids.push(layer.id)
    }),
  }
  return map as typeof map & Map
}

describe('layerStack', () => {
  it('is origin, egress, highlight, outline, route, ridden, progress, cap hit, dots, walk, stop preview, rail, then the editor', () => {
    expect(layerStack()).toEqual([
      ISOCHRONE_ORIGIN_LAYER_ID,
      ISOCHRONE_LAYER_ID,
      ISOCHRONE_HIGHLIGHT_LAYER_ID,
      ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
      ROUTE_LINE_LAYER_ID,
      RIDDEN_LINE_LAYER_ID,
      PROGRESS_LINE_LAYER_ID,
      PROGRESS_CAP_LAYER_ID,
      PROGRESS_CAP_HIT_LAYER_ID,
      STATION_DOTS_LAYER_ID,
      ORIGIN_WALK_LAYER_ID,
      LEADER_LAYER_ID,
      RAW_STOP_LAYER_ID,
      SNAPPED_STOP_LAYER_ID,
      RAIL_EXISTING_LAYER_ID,
      RAIL_CONSTRUCTION_LAYER_ID,
      RAIL_PROPOSED_LAYER_ID,
      'route-editor-polygon',
      'route-editor-polygon-outline',
      'route-editor-linestring',
      'route-editor-point',
      'route-editor-point-marker',
    ])
  })

  // The editor's layers are added by terra-draw's adapter, which only takes
  // the name of the layer to sit under; the stack still has to know them so
  // the rail overlay slots beneath them and anything later above.
  it('names the editor layers in the adapter\'s own paint order', () => {
    expect([...ROUTE_EDITOR_LAYER_IDS]).toEqual(layerStack().slice(-5))
  })
})

describe('layerAboveInStack', () => {
  it('names the nearest stack neighbour above that is on the map, or nothing when the layer would be topmost', () => {
    const map = paintMap()
    expect(layerAboveInStack(map, RAIL_PROPOSED_LAYER_ID)).toBeUndefined()
    addLayerInStack(map, spec('route-editor-point'))
    expect(layerAboveInStack(map, RAIL_PROPOSED_LAYER_ID)).toBe('route-editor-point')
    expect(layerAboveInStack(map, 'route-editor-point-marker')).toBeUndefined()
  })

  it('slots the rail overlay under the editor when the editor came first', () => {
    const map = paintMap()
    addLayerInStack(map, spec('route-editor-linestring'))
    addLayerInStack(map, spec(RAIL_EXISTING_LAYER_ID))
    addLayerInStack(map, spec(RAIL_PROPOSED_LAYER_ID))
    expect(map.ids).toEqual([RAIL_EXISTING_LAYER_ID, RAIL_PROPOSED_LAYER_ID, 'route-editor-linestring'])
  })

  it('rejects a layer that is not in the stack', () => {
    expect(() => layerAboveInStack(paintMap(), 'unknown-layer')).toThrow('unknown-layer is not in the layer stack')
  })
})

describe('addLayerInStack', () => {
  it('appends when nothing above the layer is on the map yet', () => {
    const map = paintMap()
    addLayerInStack(map, spec(ISOCHRONE_LAYER_ID))
    expect(map.addLayer).toHaveBeenCalledWith(spec(ISOCHRONE_LAYER_ID))
    expect(map.ids).toEqual([ISOCHRONE_LAYER_ID])
  })

  it('inserts a late isochrone under an already-drawn route line', () => {
    const map = paintMap()
    addLayerInStack(map, spec(ROUTE_LINE_LAYER_ID))
    addLayerInStack(map, spec(STATION_DOTS_LAYER_ID))
    addLayerInStack(map, spec(ISOCHRONE_LAYER_ID))

    expect(map.ids).toEqual([
      ISOCHRONE_LAYER_ID,
      ROUTE_LINE_LAYER_ID,
      STATION_DOTS_LAYER_ID,
    ])
  })

  it('keeps the four isochrone layers in stack order under the route line', () => {
    const map = paintMap()
    addLayerInStack(map, spec(ROUTE_LINE_LAYER_ID))
    for (const id of [
      ISOCHRONE_ORIGIN_LAYER_ID,
      ISOCHRONE_LAYER_ID,
      ISOCHRONE_HIGHLIGHT_LAYER_ID,
      ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
    ]) {
      addLayerInStack(map, spec(id))
    }

    expect(map.ids).toEqual([
      ISOCHRONE_ORIGIN_LAYER_ID,
      ISOCHRONE_LAYER_ID,
      ISOCHRONE_HIGHLIGHT_LAYER_ID,
      ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
      ROUTE_LINE_LAYER_ID,
    ])
  })

  it('puts progress between the route line and the station dots even when the walk is already up', () => {
    const map = paintMap()
    addLayerInStack(map, spec(ORIGIN_WALK_LAYER_ID))
    addLayerInStack(map, spec(ROUTE_LINE_LAYER_ID))
    addLayerInStack(map, spec(PROGRESS_LINE_LAYER_ID))
    addLayerInStack(map, spec(PROGRESS_CAP_LAYER_ID))
    addLayerInStack(map, spec(PROGRESS_CAP_HIT_LAYER_ID))
    addLayerInStack(map, spec(STATION_DOTS_LAYER_ID))

    expect(map.ids).toEqual([
      ROUTE_LINE_LAYER_ID,
      PROGRESS_LINE_LAYER_ID,
      PROGRESS_CAP_LAYER_ID,
      PROGRESS_CAP_HIT_LAYER_ID,
      STATION_DOTS_LAYER_ID,
      ORIGIN_WALK_LAYER_ID,
    ])
  })

  it('slots the leader under both pins when the raw pin was added first', () => {
    const map = paintMap()
    addLayerInStack(map, spec(RAW_STOP_LAYER_ID))
    addLayerInStack(map, spec(LEADER_LAYER_ID))
    addLayerInStack(map, spec(SNAPPED_STOP_LAYER_ID))

    expect(map.ids).toEqual([
      LEADER_LAYER_ID,
      RAW_STOP_LAYER_ID,
      SNAPPED_STOP_LAYER_ID,
    ])
  })

  it('rejects a layer that is not in the stack', () => {
    expect(() => addLayerInStack(paintMap(), spec('unknown-layer'))).toThrow(
      'unknown-layer is not in the layer stack',
    )
  })
})
