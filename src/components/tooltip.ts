/* Placement and the panel recipe for Tooltip.vue. MapLibre popups reuse the
   same chrome (they cannot mount a Vue component on a canvas feature), so the
   class string and the content node live here rather than inside the SFC.

   Utilities and tokens only — same reason as fieldStyles.ts: Tailwind scans
   .ts sources, and this project does not use @apply. */

export const TOOLTIP_WIDTH_PX = 240
export const TOOLTIP_GAP_PX = 8
// Room below the anchor that still counts as "enough to open downwards".
// Shorter than that, and with more space above than below, the box flips up.
export const TOOLTIP_ROOM_PX = 140

export const TOOLTIP_PANEL_CLASS =
  'rounded-(--radius-field) border border-border bg-white p-2 shadow-(--shadow-panel)'

export const TOOLTIP_LAYER_CLASS =
  'pointer-events-none fixed z-20 transition-opacity duration-200 ease-(--ease-smooth)'

// Worn by the MapLibre Popup wrapper so style.css can strip MapLibre's own
// chrome and let TOOLTIP_PANEL_CLASS paint the box.
export const TOOLTIP_MAP_POPUP_CLASS = 'tooltip-popup'

export interface TooltipAnchor {
  top: number
  right: number
  bottom: number
  left: number
}

export interface TooltipViewport {
  width: number
  height: number
}

export interface TooltipPlacement {
  left: number
  width: number
  top?: number
  bottom?: number
}

/**
 * Where the box should sit so it stays on-screen next to its anchor.
 *
 * Prefers below the anchor, aligned to the anchor's left edge. Flips above
 * when the foot of the viewport is closer than the box is tall, and slides
 * left or right when that alignment would cross a viewport edge — the case
 * a narrow rail or a station near the map frame actually hits.
 */
export function placeTooltip(
  anchor: TooltipAnchor,
  viewport: TooltipViewport,
  width = TOOLTIP_WIDTH_PX,
): TooltipPlacement {
  const left = Math.max(
    TOOLTIP_GAP_PX,
    Math.min(anchor.left, viewport.width - width - TOOLTIP_GAP_PX),
  )
  const below = viewport.height - anchor.bottom
  const placement: TooltipPlacement = { left, width }
  if (below < TOOLTIP_ROOM_PX && anchor.top > below) {
    placement.bottom = viewport.height - anchor.top + TOOLTIP_GAP_PX
  } else {
    placement.top = anchor.bottom + TOOLTIP_GAP_PX
  }
  return placement
}

export function tooltipStyle(placement: TooltipPlacement): Record<string, string> {
  const style: Record<string, string> = {
    left: `${placement.left}px`,
    width: `${placement.width}px`,
  }
  if (placement.top !== undefined) style.top = `${placement.top}px`
  if (placement.bottom !== undefined) style.bottom = `${placement.bottom}px`
  return style
}

/** A text node wearing the panel recipe, for MapLibre's setDOMContent. */
export function tooltipContent(text: string): HTMLElement {
  const node = document.createElement('div')
  node.className = `${TOOLTIP_PANEL_CLASS} font-body text-caption text-ink`
  node.textContent = text
  return node
}
