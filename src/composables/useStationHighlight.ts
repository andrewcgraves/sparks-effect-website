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
  // The station the page has highlighted, which this map may not be the source
  // of: the Time remaining card raises one too. A getter for the same reason as
  // above, and re-read on every sync so a highlight raised elsewhere lands here.
  activeSlug: () => string | null
  // Reports a station hovered on this map, and null when the pointer leaves
  // one. The page decides what to do with it; nothing is highlighted until it
  // comes back through activeSlug.
  onHover: (slug: string | null) => void
}

function stationOf(event: MapLayerMouseEvent): HighlightedStation | null {
  const feature = event.features?.[0]
  if (!feature || feature.geometry.type !== 'Point') return null
  const { slug, name } = feature.properties as Record<string, unknown>
  if (typeof slug !== 'string' || typeof name !== 'string') return null
  return { slug, name, lngLat: feature.geometry.coordinates as [number, number] }
}

/**
 * Highlights the page's active station on the map: its egress isochrone above
 * every other one it might overlap, and its name in a popup while the pointer
 * is on its dot.
 *
 * Hover is the only way a station is highlighted. SPA-211 shipped
 * click-to-persist, and this deliberately takes it back: with the journey's
 * detail now living in the Time remaining card, a second highlight mechanism
 * only leaves a stale selection on the map with nothing to show for it.
 *
 * Which station is active is not decided here. The page owns that single
 * reference and both surfaces feed it, so a row hovered in the card lights the
 * same polygon a dot hovered here does.
 */
export function useStationHighlight(map: Map, callbacks: StationHighlightCallbacks): { release: () => void; sync: () => void } {
  const canvas = map.getCanvas()
  const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 })
  let hovered: HighlightedStation | null = null

  function applyHighlight(): void {
    // Dimming is only worth doing when there is something to promote in its
    // place. A station the plot drew no polygon for would otherwise fade every
    // isochrone on the map and put nothing on top, which reads as the station's
    // orange disappearing under the blue origin fill (SPA-224). Its name still
    // goes up in the popup — the dot was hovered either way.
    const active = callbacks.activeSlug()
    const promoted = active !== null && callbacks.egressSlugs().has(active) ? active : null

    if (map.getLayer(ISOCHRONE_LAYER_ID)) {
      map.setPaintProperty(ISOCHRONE_LAYER_ID, 'fill-opacity', isochroneEgressOpacity(promoted !== null))
    }
    if (map.getLayer(ISOCHRONE_ORIGIN_LAYER_ID)) {
      map.setPaintProperty(ISOCHRONE_ORIGIN_LAYER_ID, 'fill-opacity', isochroneOriginOpacity(promoted !== null))
    }
    // The highlighted polygon is repainted on these separate top layers so it
    // reads above every other station's — fill-opacity alone can't reorder
    // features within a single layer.
    const filter = isochroneHighlightFilter(promoted)
    if (map.getLayer(ISOCHRONE_HIGHLIGHT_LAYER_ID)) {
      map.setFilter(ISOCHRONE_HIGHLIGHT_LAYER_ID, filter)
    }
    if (map.getLayer(ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID)) {
      map.setFilter(ISOCHRONE_HIGHLIGHT_OUTLINE_LAYER_ID, filter)
    }
    // The popup belongs to this map's own pointer. A station made active from
    // the card has no dot under the cursor to hang one off, and putting one up
    // anyway would leave the map annotating something nobody is pointing at.
    if (hovered) popup.setLngLat(hovered.lngLat).setText(hovered.name).addTo(map)
    else popup.remove()
  }

  function handleEnter(event: MapLayerMouseEvent): void {
    const station = stationOf(event)
    if (!station) return
    hovered = station
    canvas.style.cursor = 'pointer'
    callbacks.onHover(station.slug)
    applyHighlight()
  }

  function handleLeave(): void {
    hovered = null
    canvas.style.cursor = callbacks.idleCursor()
    callbacks.onHover(null)
    applyHighlight()
  }

  map.on('mouseenter', STATION_DOTS_LAYER_ID, handleEnter)
  map.on('mouseleave', STATION_DOTS_LAYER_ID, handleLeave)

  return {
    // The popup is a DOM element over the canvas, same as a Marker — the
    // map's own teardown would not collect it.
    release: () => popup.remove(),
    sync: applyHighlight,
  }
}

/**
 * Station highlighting as a map module.
 *
 * Binds to the layer the route module creates, so it must be listed after
 * routeLayerModule. It watches the page's active station, because that is the
 * one input it has that this map is not itself the source of — a row hovered in
 * the Time remaining card has to reach the polygons somehow.
 */
export function stationHighlightModule(callbacks: StationHighlightCallbacks): MapModule {
  let highlight: { release: () => void; sync: () => void } | null = null

  return {
    deps: () => callbacks.activeSlug(),
    isReady: (styleLoaded) => styleLoaded,
    attach: (map) => { highlight = useStationHighlight(map, callbacks) },
    sync: () => { highlight?.sync() },
    detach: () => { highlight?.release(); highlight = null },
  }
}
