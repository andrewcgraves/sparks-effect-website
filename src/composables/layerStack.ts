import type { AddLayerObject, Map } from 'maplibre-gl'
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

// Built on first read so the layer-id modules can finish evaluating — they
// import addLayerInStack from this file, and reading their exports at init
// would see the cycle mid-construction.
let stack: readonly string[] | undefined

export function layerStack(): readonly string[] {
  return (stack ??= [
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
    ...ROUTE_EDITOR_LAYER_IDS,
  ])
}

// The nearest stack neighbour above `id` that is already on the map, so a
// layer that attaches late still lands in stack order rather than on top
// (SPA-213). Nothing above it yet means append — later neighbours insert
// themselves underneath when they attach.
export function layerAboveInStack(map: Map, id: string): string | undefined {
  const order = layerStack()
  const index = order.indexOf(id)
  if (index === -1) {
    throw new Error(`${id} is not in the layer stack`)
  }
  return order.slice(index + 1).find((above) => map.getLayer(above))
}

export function addLayerInStack(map: Map, spec: AddLayerObject): void {
  const beforeId = layerAboveInStack(map, spec.id)
  if (beforeId) map.addLayer(spec, beforeId)
  else map.addLayer(spec)
}
