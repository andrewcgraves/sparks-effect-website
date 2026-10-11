import type { TravelMode } from '../api/authoring/types'

export const MODE_LABELS: Record<TravelMode, string> = {
  walk: 'Walk',
  bike: 'Bike',
  drive: 'Drive',
  transit: 'Transit',
}

// The noun a budget is spent on, as in "a 30-minute bike ride".
export const MODE_TRIPS: Record<TravelMode, string> = {
  walk: 'walk',
  bike: 'bike ride',
  drive: 'drive',
  transit: 'transit trip',
}

// Chain metadata and pre-rendered summaries type the mode as a plain string;
// one the build has no label for is printed as sent rather than dropped.
export function modeLabel(mode: string): string {
  return Object.hasOwn(MODE_LABELS, mode) ? MODE_LABELS[mode as TravelMode] : mode
}
