import { formatProgressPercent, formatTimeRemaining } from './timeRemaining'

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
  node.className = `${TOOLTIP_PANEL_CLASS} t-meta text-ink`
  node.textContent = text
  return node
}

export function progressTooltipText(fraction: number, stationName: string, rideSecs: number): string {
  const shortSecs = rideSecs * (1 - fraction)
  return `${formatProgressPercent(fraction)} of the way to ${stationName} — ${formatTimeRemaining(shortSecs)} short`
}

export function progressTooltipContent(
  fraction: number,
  stationName: string,
  rideSecs: number,
): HTMLElement {
  return tooltipContent(progressTooltipText(fraction, stationName, rideSecs))
}

export function stationTooltipContent(name: string, elapsedSecs: number | null): HTMLElement {
  const node = document.createElement('div')
  node.className = TOOLTIP_PANEL_CLASS

  const title = document.createElement('p')
  title.className = 't-meta text-ink'
  title.textContent = name
  node.append(title)

  if (elapsedSecs !== null) {
    const elapsed = document.createElement('p')
    elapsed.className = 't-meta tabular-nums text-ink-muted'
    // Rounded up where the card rounds the time left down, so the two still
    // add up to the travel time: 11m to get here, 1h 49m left of 2h.
    elapsed.textContent = `${formatTimeRemaining(Math.ceil(elapsedSecs / 60) * 60)} to get here`
    node.append(elapsed)
  }

  return node
}
