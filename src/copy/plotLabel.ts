import type { TravelMode } from '../api/authoring/types'
import { MODE_TRIPS } from './modes'

export const DEFAULT_PLOT_LABEL = 'Plot a {minutes}-min {mode}'

export function formatPlotLabel(template: string | null | undefined, minutes: number, mode: TravelMode): string {
  // A network's template comes from the API (SPA-542). One that is only
  // whitespace counts as unset, so the button never reads blank.
  const chosen = template?.trim() ? template : DEFAULT_PLOT_LABEL
  return chosen.replaceAll('{minutes}', String(minutes)).replaceAll('{mode}', MODE_TRIPS[mode])
}
