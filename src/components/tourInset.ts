export interface TourInset {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSET: TourInset = { top: 0, right: 0, bottom: 0, left: 0 }

const CLEARANCE_PX = 24

export function cameraPadding(inset: TourInset, open: number): TourInset {
  // An open side keeps the breathing room it always had; a side something
  // floats over is framed from that thing's edge instead of the map's.
  const side = (covered: number) => (covered > 0 ? covered + CLEARANCE_PX : open)
  return { top: side(inset.top), right: side(inset.right), bottom: side(inset.bottom), left: side(inset.left) }
}

export function clearView(
  inset: TourInset,
  point: { x: number; y: number },
  size: { width: number; height: number },
): { point: { x: number; y: number }; frame: { width: number; height: number } } {
  return {
    point: { x: point.x - inset.left, y: point.y - inset.top },
    frame: { width: size.width - inset.left - inset.right, height: size.height - inset.top - inset.bottom },
  }
}
