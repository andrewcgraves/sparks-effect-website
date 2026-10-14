// Tailwind's `lg` (64rem): the width from which the tour sets its map beside
// the steps rather than over them.
export const TOUR_WIDE_QUERY = '(min-width: 64rem)'
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function matchesMedia(query: string): boolean {
  return window.matchMedia?.(query).matches ?? false
}
