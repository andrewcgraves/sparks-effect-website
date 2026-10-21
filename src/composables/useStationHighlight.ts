import { Popup, type Map, type MapLayerMouseEvent, type MapMouseEvent } from 'maplibre-gl'
import type { MapModule } from './mapLifecycle'
import { PROGRESS_CAP_HIT_LAYER_ID, STATION_DOTS_LAYER_ID } from './useRouteLayer'
import { TOOLTIP_MAP_POPUP_CLASS, progressTooltipContent, stationTooltipContent } from '../components/tooltip'
import { showIsochroneHighlight } from './useIsochroneLayer'

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
  stationName: (slug: string) => string
  onHover: (slug: string | null) => void
}

interface UnfinishedCap {
  to: string
  fraction: number
  rideSecs: number
  lngLat: [number, number]
}

function stationOf(event: MapLayerMouseEvent): HighlightedStation | null {
  const feature = event.features?.[0]
  if (!feature || feature.geometry.type !== 'Point') return null
  const { slug, name } = feature.properties as Record<string, unknown>
  if (typeof slug !== 'string' || typeof name !== 'string') return null
  return { slug, name, lngLat: feature.geometry.coordinates as [number, number] }
}

function unfinishedCapOf(event: MapLayerMouseEvent): UnfinishedCap | null {
  const feature = event.features?.[0]
  if (!feature || feature.geometry.type !== 'Point') return null
  const { to, fraction, ride_secs: rideSecs } = (feature.properties ?? {}) as Record<string, unknown>
  if (typeof to !== 'string' || to.length === 0) return null
  const frac = Number(fraction)
  const ride = Number(rideSecs)
  if (!Number.isFinite(frac) || !Number.isFinite(ride)) return null
  return { to, fraction: frac, rideSecs: ride, lngLat: feature.geometry.coordinates as [number, number] }
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
  let tapped: HighlightedStation | null = null
  let cap: UnfinishedCap | null = null

  function pointedAt(): HighlightedStation | null {
    return hovered ?? tapped
  }

  function applyHighlight(): void {
    // Dimming is only worth doing when there is something to promote in its
    // place. A station the plot drew no polygon for would otherwise fade every
    // isochrone on the map and put nothing on top, which reads as the station's
    // highlight disappearing under the origin fill (SPA-224). Its name still
    // goes up in the popup — the dot was hovered either way.
    const active = callbacks.activeSlug()
    const promoted = active !== null && callbacks.egressSlugs().has(active) ? active : null

    // The rest of the splash zone rests light and stays put while the one
    // station is lifted out on separate top layers. Dimming the whole map on
    // every hover was a third of a second of full redraws, which an older
    // graphics chip feels: a hover settles in about 30 ms without it, against
    // about 350 ms with it (SPA-524, SPA-526).
    showIsochroneHighlight(map, promoted)
    // The popup belongs to this map's own pointer. A station made active from
    // the card has no dot under the cursor to hang one off, and putting one up
    // anyway would leave the map annotating something nobody is pointing at.
    // The unfinished-leg cap is the other thing that can sit under the pointer:
    // it is not a station, so it takes the popup without promoting a polygon.
    const shown = pointedAt()
    if (cap) {
      popup
        .setLngLat(cap.lngLat)
        .setDOMContent(progressTooltipContent(cap.fraction, callbacks.stationName(cap.to), cap.rideSecs))
        .addTo(map)
    } else if (shown) {
      popup
        .setLngLat(shown.lngLat)
        .setDOMContent(stationTooltipContent(shown.name, callbacks.remainingSecs(shown.slug)))
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
    if (!cap) callbacks.onHover(station.slug)
    applyHighlight()
  }

  function handleLeave(): void {
    hovered = null
    if (!cap) {
      canvas.style.cursor = callbacks.idleCursor()
      callbacks.onHover(tapped?.slug ?? null)
    }
    applyHighlight()
  }

  // A touch screen has no hover: its emulated mouse events arrive with a tap
  // and leave with the next one, so the name would only flicker. A tapped
  // station holds until a tap lands off the dots.
  function handleTap(event: MapLayerMouseEvent): void {
    const station = stationOf(event)
    if (!station) return
    // Tells the map-wide listener below, which sees this same event next,
    // that the tap landed on a dot.
    event.preventDefault()
    tapped = station
    // The pointer is on this dot whatever mouseenter last said: it fires on
    // entering the layer, not on moving from one dot to the next.
    if (hovered) hovered = station
    if (!cap) callbacks.onHover(station.slug)
    applyHighlight()
  }

  function handleTapElsewhere(event: MapMouseEvent): void {
    if (event.defaultPrevented || !tapped) return
    tapped = null
    if (!cap && !hovered) callbacks.onHover(null)
    applyHighlight()
  }

  function handleCapEnter(event: MapLayerMouseEvent): void {
    const next = unfinishedCapOf(event)
    if (!next) return
    cap = next
    canvas.style.cursor = 'pointer'
    // The cap is not a station: drop any leftover polygon promote while the
    // pointer is explaining the unfinished hop.
    if (pointedAt()) callbacks.onHover(null)
    applyHighlight()
  }

  function handleCapLeave(): void {
    cap = null
    canvas.style.cursor = hovered ? 'pointer' : callbacks.idleCursor()
    const underneath = pointedAt()
    if (underneath) callbacks.onHover(underneath.slug)
    applyHighlight()
  }

  map.on('mouseenter', STATION_DOTS_LAYER_ID, handleEnter)
  map.on('mouseleave', STATION_DOTS_LAYER_ID, handleLeave)
  map.on('click', STATION_DOTS_LAYER_ID, handleTap)
  map.on('click', handleTapElsewhere)
  // Bound to the unpainted hit circle, not the 3.5px disc: MapLibre hit-tests
  // painted radius, and the visible cap is too small to find at state zoom.
  map.on('mouseenter', PROGRESS_CAP_HIT_LAYER_ID, handleCapEnter)
  map.on('mouseleave', PROGRESS_CAP_HIT_LAYER_ID, handleCapLeave)

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
