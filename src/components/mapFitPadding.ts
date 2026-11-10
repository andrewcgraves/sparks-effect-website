export interface FitPadding {
  top: number
  bottom: number
  left: number
  right: number
}

const SITE_PADDING: FitPadding = { top: 56, bottom: 112, left: 56, right: 56 }
const MIN_PADDING = 8

// The site's padding is a fixed size chosen for a map hundreds of pixels on a
// side. In a small frame it becomes a share of the frame instead, so the fit
// keeps most of it; the bottom keeps its larger share for what sits there.
export function mapFitPadding(width: number, height: number): FitPadding {
  // Nothing can be fitted into a map with no size yet; the fit that follows
  // its first measurement is the one that counts.
  if (width <= 0 || height <= 0) return { ...SITE_PADDING }
  const share = (fixed: number, fraction: number, size: number) =>
    Math.max(MIN_PADDING, Math.min(fixed, Math.round(size * fraction)))
  return {
    top: share(SITE_PADDING.top, 0.1, height),
    bottom: share(SITE_PADDING.bottom, 0.2, height),
    left: share(SITE_PADDING.left, 0.15, width),
    right: share(SITE_PADDING.right, 0.15, width),
  }
}
