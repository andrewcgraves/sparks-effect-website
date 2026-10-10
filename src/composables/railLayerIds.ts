// Only ids live here: layerStack.ts is in every map's chunk, and the rail
// overlay and the route editor it would otherwise import carry the tile
// decoder and the graph, which belong to the builder's chunk alone.
export const RAIL_EXISTING_LAYER_ID = 'rail-overlay-existing'
export const RAIL_CONSTRUCTION_LAYER_ID = 'rail-overlay-construction'
export const RAIL_PROPOSED_LAYER_ID = 'rail-overlay-proposed'

export const ROUTE_EDITOR_PREFIX = 'route-editor'
// In the adapter's own paint order, bottom to top; it adds these itself and
// moves the first four beneath renderBelowLayerId, so the stack only has to
// know their names and the neighbour above them.
export const ROUTE_EDITOR_LAYER_IDS = [
  `${ROUTE_EDITOR_PREFIX}-polygon`,
  `${ROUTE_EDITOR_PREFIX}-polygon-outline`,
  `${ROUTE_EDITOR_PREFIX}-linestring`,
  `${ROUTE_EDITOR_PREFIX}-point`,
  `${ROUTE_EDITOR_PREFIX}-point-marker`,
] as const
