import type { Map, MapLayerMouseEvent, MapLayerTouchEvent, MapMouseEvent, MapTouchEvent } from 'maplibre-gl'
import type { SnapCoord as LatLng } from '../api/authoring/types'
import { RAW_STOP_LAYER_ID } from './useStopPreviewLayer'

export interface StopDragCallbacks {
  // Fires continuously while the pointer moves, so the pin can follow it.
  onDrag: (id: string, coord: LatLng) => void
  // Fires once, on release — the point at which it is worth re-snapping.
  onDragEnd: (id: string, coord: LatLng) => void
  // What the canvas cursor should return to once the pointer leaves a pin.
  // The caller owns it because click-to-place mode paints its own crosshair.
  idleCursor: () => string
}

function coordOf(event: { lngLat: { lat: number; lng: number } }): LatLng {
  return { lat: event.lngLat.lat, lng: event.lngLat.lng }
}

// Makes the raw stop pins draggable by hand-wiring pointer events against the
// existing circle layer, rather than swapping it for MapLibre Marker
// instances. Markers would have meant maintaining a parallel set of DOM
// elements for pins the snapped-pin and leader-line layers already read out of
// the same GeoJSON source — this way the whole preview keeps rendering from
// one source of truth, and a drag is just a coordinate edit like any other.
export function useStopDrag(map: Map, callbacks: StopDragCallbacks): void {
  const canvas = map.getCanvas()
  let draggingId: string | null = null
  let moveEventName: 'mousemove' | 'touchmove' | null = null
  // Where the pin was last seen. The drag can end on an event that carries no
  // position (see endFromWindow), and this is the honest answer for that case.
  let lastCoord: LatLng | null = null

  function setCursor(cursor: string): void {
    canvas.style.cursor = cursor
  }

  function stopIdOf(event: MapLayerMouseEvent | MapLayerTouchEvent): string | null {
    const id = event.features?.[0]?.properties?.['id']
    return id === undefined || id === null ? null : String(id)
  }

  function handleMove(event: MapMouseEvent | MapTouchEvent): void {
    if (!draggingId) return
    lastCoord = coordOf(event)
    callbacks.onDrag(draggingId, lastCoord)
  }

  // Idempotent, because the release usually arrives twice — once as the map's
  // own event and once through the window backstop.
  function endDrag(coord: LatLng | null): void {
    const id = draggingId
    if (!id) return
    // lastCoord is set only by handleMove, so a null one means the pointer
    // never travelled — the drop position is whatever the pin already had.
    const settled = lastCoord === null ? null : (coord ?? lastCoord)
    draggingId = null
    lastCoord = null
    if (moveEventName) map.off(moveEventName, handleMove)
    moveEventName = null
    window.removeEventListener('mouseup', endFromWindow)
    window.removeEventListener('touchend', endFromWindow)
    window.removeEventListener('touchcancel', endFromWindow)
    setCursor(callbacks.idleCursor())
    // A press that never moved is a click, not a reposition — reporting it
    // would rewrite the stop with the coordinates it already has.
    if (settled) callbacks.onDragEnd(id, settled)
  }

  // MapLibre only fires its own mouseup for releases over the canvas: a
  // release anywhere else in the document reaches it as `mouseupWindow`,
  // which its map-event handler doesn't translate. Without this backstop a
  // pin dragged past the map's edge and dropped would leave the drag open
  // forever, and with it every consumer waiting on the drop.
  function endFromWindow(): void {
    endDrag(null)
  }

  // preventDefault() is what keeps the map from panning underneath the pin:
  // it tells MapLibre's own drag-pan handler that this gesture is spoken for.
  function beginDrag(
    event: MapLayerMouseEvent | MapLayerTouchEvent,
    moveEvent: 'mousemove' | 'touchmove',
    endEvent: 'mouseup' | 'touchend',
  ): void {
    const id = stopIdOf(event)
    if (!id) return
    event.preventDefault()
    draggingId = id
    moveEventName = moveEvent
    lastCoord = null
    setCursor('grabbing')
    map.on(moveEvent, handleMove)
    map.once(endEvent, (ended: MapMouseEvent | MapTouchEvent) => endDrag(coordOf(ended)))
    window.addEventListener('mouseup', endFromWindow)
    window.addEventListener('touchend', endFromWindow)
    window.addEventListener('touchcancel', endFromWindow)
  }

  map.on('mouseenter', RAW_STOP_LAYER_ID, () => setCursor('grab'))
  map.on('mouseleave', RAW_STOP_LAYER_ID, () => {
    if (!draggingId) setCursor(callbacks.idleCursor())
  })

  map.on('mousedown', RAW_STOP_LAYER_ID, (event) => beginDrag(event, 'mousemove', 'mouseup'))

  // A second finger means the user is pinching the map, not moving a pin.
  map.on('touchstart', RAW_STOP_LAYER_ID, (event) => {
    if (event.points.length !== 1) return
    beginDrag(event, 'touchmove', 'touchend')
  })
}
