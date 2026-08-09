import { Popup, type Map, type MapLayerMouseEvent } from 'maplibre-gl'
import type { MapModule } from './mapLifecycle'
import { STATION_DOTS_LAYER_ID } from './useRouteLayer'
import {
  ISOCHRONE_LAYER_ID,
  ISOCHRONE_ORIGIN_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_LAYER_ID,
  ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID,
  isochroneEgressOpacity,
  isochroneOriginOpacity,
  isochroneHighlightFilter,
} from './useIsochroneLayer'

interface HighlightedStation {
  slug: string
  name: string
  lngLat: [number, number]
}

export interface StationHighlightCallbacks {
  // What the canvas cursor should return to once the pointer leaves a
  // station dot. Mirrors useStopDrag's idleCursor: the caller owns it because
  // click-to-place mode paints its own crosshair, which a bare '' would clobber.
  idleCursor: () => string
  // Which stations the current plot drew an egress polygon for. A getter
  // rather than a value, because the plot is regenerated under a map that
  // keeps its listeners — see `egressStationSlugs`.
  egressSlugs: () => Set<string>
}

function stationOf(event: MapLayerMouseEvent): HighlightedStation | null {
  const feature = event.features?.[0]
  if (!feature || feature.geometry.type !== 'Point') return null
  const { slug, name } = feature.properties as Record<string, unknown>
  if (typeof slug !== 'string' || typeof name !== 'string') return null
  return { slug, name, lngLat: feature.geometry.coordinates as [number, number] }
}

/**
 * Hovering or clicking a station dot highlights that station's egress
 * isochrone above every other one it might overlap, and names the station in
 * a popup (SPA-211).
 *
 * A click's highlight outlives the hover that made it — it persists until a
 * different station is clicked — but a hover on another station always shows
 * on top of a standing selection, the same way a tooltip would.
 */
export function useStationHighlight(map: Map, callbacks: StationHighlightCallbacks): { release: () => void } {
  const canvas = map.getCanvas()
  const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 })
  let hovered: HighlightedStation | null = null
  let selected: HighlightedStation | null = null

  function applyHighlight(): void {
    const active = hovered ?? selected
    // Dimming is only worth doing when there is something to promote in its
    // place. A station the plot drew no polygon for would otherwise fade every
    // isochrone on the map and put nothing on top, which reads as the station's
    // orange disappearing under the blue origin fill (SPA-224). Its name still
    // goes up in the popup — the dot was hovered either way — and a standing
    // selection keeps its own highlight rather than losing it to a hover that
    // has nothing to show.
    const drawn = callbacks.egressSlugs()
    const promoted = [hovered, selected].find(
      (station): station is HighlightedStation => station !== null && drawn.has(station.slug),
    ) ?? null

    if (map.getLayer(ISOCHRONE_LAYER_ID)) {
      map.setPaintProperty(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneEgressOpacity(promoted !== null))
    }
    if (map.getLayer(ISOCHRONE_ORIGIN_LAYER_ID)) {
      map.setPaintProperty(ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity', isochroneOriginOpacity(promoted !== null))
    }
    // The highlighted polygon is repainted on these separate top layers so it
    // reads above every other station's — fill-opacity alone can't reorder
    // features within a single layer.
    const filter = isochroneHighlightFilter(promoted?.slug ?? null)
    if (map.getLayer(ISOCHRONE_HIGHLIGHT_LAYER_ID)) {
      map.setFilter(ISOCHRONE_HIGHLIGHT_LAYER_ID, filter)
    }
    if (map.getLayer(ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID)) {
      map.setFilter(ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID, filter)
    }
    if (active) popup.setLngLat(active.lngLat).setText(active.name).addTo(map)
    else popup.remove()
  }

  function handleEnter(event: MapLayerMouseEvent): void {
    const station = stationOf(event)
    if (!station) return
    hovered = station
    canvas.style.cursor = 'pointer'
    applyHighlight()
  }

  function handleLeave(): void {
    hovered = null
    canvas.style.cursor = callbacks.idleCursor()
    applyHighlight()
  }

  function handleClick(event: MapLayerMouseEvent): void {
    const station = stationOf(event)
    if (!station) return
    selected = station
    applyHighlight()
  }

  map.on('mouseenter', STATION_DOTS_LAYER_ID, handleEnter)
  map.on('mouseleave', STATION_DOTS_LAYER_ID, handleLeave)
  map.on('click', STATION_DOTS_LAYER_ID, handleClick)

  return {
    // The popup is a DOM element over the canvas, same as a Marker — the
    // map's own teardown would not collect it.
    release: () => popup.remove(),
  }
}

/**
 * Station highlighting as a map module.
 *
 * Binds to the layer the route module creates, so it must be listed after
 * routeLayerModule. There is no data of its own to sync — the paint property
 * it drives is pushed straight from the event handlers above rather than
 * from a watched prop.
 */
export function stationHighlightModule(callbacks: StationHighlightCallbacks): MapModule {
  let highlight: { release: () => void } | null = null

  return {
    deps: () => null,
    isReady: (styleLoaded) => styleLoaded,
    attach: (map) => { highlight = useStationHighlight(map, callbacks) },
    sync: () => {},
    detach: () => { highlight?.release(); highlight = null },
  }
}
