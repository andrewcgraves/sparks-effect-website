export const TOOLTIP_WIDTH_PX = 240
export const TOOLTIP_GAP_PX = 8
export const TOOLTIP_ROOM_PX = 140

export const TOOLTIP_PANEL_CLASS =
  'rounded-(--radius-field) border border-border bg-white p-2 shadow-(--shadow-panel)'

export const TOOLTIP_LAYER_CLASS =
  'pointer-events-none fixed z-20 transition-opacity duration-200 ease-(--ease-smooth)'

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

export function tooltipContent(text: string): HTMLElement {
  const node = document.createElement('div')
  node.className = `${TOOLTIP_PANEL_CLASS} font-body text-caption text-ink`
  node.textContent = text
  return node
}
