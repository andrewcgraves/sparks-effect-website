export type SplashStyle = 'stacked' | 'flat'
export type MapSharpness = 'full' | 'reduced' | 'adaptive'
export type HighlightStyle = 'dim' | 'lift'

export interface MapTrial {
  splash: SplashStyle
  sharpness: MapSharpness
  highlight: HighlightStyle
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

// SPA-524: switches for trying the map's drawing trade-offs on a slow laptop
// from a preview URL — ?splash=flat, ?sharpness=adaptive|reduced,
// ?highlight=lift. Remove once one combination is chosen.
export function readMapTrial(search: string = typeof window === 'undefined' ? '' : window.location.search): MapTrial {
  const params = new URLSearchParams(search)
  return {
    splash: pick(params.get('splash'), ['stacked', 'flat'], 'stacked'),
    sharpness: pick(params.get('sharpness'), ['full', 'reduced', 'adaptive'], 'full'),
    highlight: pick(params.get('highlight'), ['dim', 'lift'], 'dim'),
  }
}

export const mapTrial: MapTrial = readMapTrial()
