import type { AddLayerObject, Map } from 'maplibre-gl'
import {
  ISOCHRONE_HIGHLIGHT_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
  ISOCHRONE_LAYER_ID,
  ISOCHRONE_ORIGIN_LAYER_ID,
} from './useIsochroneLayer'
import { ORIGIN_WALK_LAYER_ID } from './useOriginWalkLayer'
import {
  PROGRESS_CAP_LAYER_ID,
  PROGRESS_LINE_LAYER_ID,
  ROUTE_LINE_LAYER_ID,
  STATION_DOTS_LAYER_ID,
} from './useRouteLayer'
import {
  LEADER_LAYER_ID,
  RAW_STOP_LAYER_ID,
  SNAPPED_STOP_LAYER_ID,
} from './useStopPreviewLayer'

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
    PROGRESS_LINE_LAYER_ID,
    PROGRESS_CAP_LAYER_ID,
    STATION_DOTS_LAYER_ID,
    ORIGIN_WALK_LAYER_ID,
    LEADER_LAYER_ID,
    RAW_STOP_LAYER_ID,
    SNAPPED_STOP_LAYER_ID,
  ])
}

export function addLayerInStack(map: Map, spec: AddLayerObject): void {
  const order = layerStack()
  const index = order.indexOf(spec.id)
  if (index === -1) {
    throw new Error(`${spec.id} is not in the layer stack`)
  }
  // Insert before the next stack neighbour already on the map, so a layer
  // that attaches late still lands in STACK order rather than appending on
  // top (SPA-213). If nothing above it exists yet, append — later neighbours
  // will insert themselves underneath when they attach.
  const beforeId = order.slice(index + 1).find((id) => map.getLayer(id))
  if (beforeId) map.addLayer(spec, beforeId)
  else map.addLayer(spec)
}
