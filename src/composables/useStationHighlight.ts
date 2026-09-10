import { Popup, type Map, type MapLayerMouseEvent } from 'maplibre-gl'
import type { MapModule } from './mapLifecycle'
import { STATION_DOTS_LAYER_ID } from './useRouteLayer'
import { TOOLTIP_MAP_POPUP_CLASS, stationTooltipContent } from '../components/tooltip'
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
  idleCursor: () => string
  egressSlugs: () => Set<string>
  activeSlug: () => string | null
  remainingSecs: (slug: string) => number | null
  onHover: (slug: string | null) => void
}

function stationOf(event: MapLayerMouseEvent): HighlightedStation | null {
  const feature = event.features?.[0]
  if (!feature || feature.geometry.type !== 'Point') return null
  const { slug, name } = feature.properties as Record<string, unknown>
  if (typeof slug !== 'string' || typeof name !== 'string') return null
  return { slug, name, lngLat: feature.geometry.coordinates as [number, number] }
}

export function useStationHighlight(map: Map, callbacks: StationHighlightCallbacks): { release: () => void; sync: () => void } {
  const canvas = map.getCanvas()
  const popup = new Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: TOOLTIP_MAP_POPUP_CLASS,
    maxWidth: 'none',
  })
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
    if (hovered) {
      popup
        .setLngLat(hovered.lngLat)
        .setDOMContent(stationTooltipContent(hovered.name, callbacks.remainingSecs(hovered.slug)))
        .addTo(map)
    } else {
      popup.remove()
    }
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
