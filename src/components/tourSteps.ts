import { isochroneLegend } from '../composables/useIsochroneLayer'
import type { SampleMapPart } from './sampleMapData'

export type TourSwatch =
  | 'start'
  | 'origin-fill'
  | 'walk'
  | 'stations'
  | 'ridden'
  | 'unfinished'
  | 'egress-fill'
  | 'unridden'

export interface TourStep {
  id: string
  name: string
  swatch: TourSwatch
  caption: string
  focus: readonly SampleMapPart[]
}

// The key's own labels, so a step and the map it explains never name the same
// thing two ways.
const KEY = Object.fromEntries(
  isochroneLegend(undefined, { unfinished: true, starterWalk: true }).map((entry) => [entry.source, entry.label]),
)

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'origin',
    name: 'Starting point',
    swatch: 'start',
    caption: 'Where the trip starts: an address you searched for, your location, or a point you picked on the map.',
    focus: ['origin-marker'],
  },
  {
    id: 'origin-reach',
    name: KEY.origin,
    swatch: 'origin-fill',
    caption: 'Everywhere you could get from the start within your travel time by your mode alone (walking, biking, driving or local transit) without boarding the line.',
    focus: ['origin-fill', 'origin-marker'],
  },
  {
    id: 'starter-walk',
    name: KEY.starter,
    swatch: 'walk',
    caption: 'The way to the station you could reach soonest. Every other station in reach was tried too; what they lead to is already shaded.',
    focus: ['origin-walk', 'origin-marker'],
  },
  {
    id: 'stations',
    name: 'Stations',
    swatch: 'stations',
    caption: 'Filled orange: the trip reaches this station in time. White: it doesn’t.',
    focus: ['station-dots'],
  },
  {
    id: 'ridden',
    name: 'Ridden',
    swatch: 'ridden',
    caption: 'The stretches of the line a trip rides end to end, from one station to the next.',
    focus: ['ridden-line', 'station-dots'],
  },
  {
    id: 'unfinished',
    name: 'Unfinished',
    swatch: 'unfinished',
    caption: `A ride the time ran out partway through. The dot, “${KEY.unfinished}” on the map, marks where, and it isn’t a station. Point at it to see how far short the ride fell.`,
    focus: ['progress-line', 'progress-cap', 'route-line'],
  },
  {
    id: 'egress',
    name: KEY.egress,
    swatch: 'egress-fill',
    caption: 'Everywhere you could get after stepping off at a station, heading out the same way with the minutes left. Where areas overlap, the colour deepens. Point at a station to pick out its area and see the minutes left.',
    focus: ['egress-fill', 'station-dots'],
  },
  {
    id: 'unridden',
    name: 'Unridden',
    swatch: 'unridden',
    caption: 'The rest of the network, which no trip here rides. Before you plot anything, the whole network is drawn in black.',
    focus: ['route-line'],
  },
]

export function stepForPart(part: SampleMapPart): number {
  // A part lit by several steps belongs to the one it leads: the station dots
  // are lit beside the ridden legs, but a click on one asks about stations.
  const leading = TOUR_STEPS.findIndex((step) => step.focus[0] === part)
  return leading !== -1 ? leading : TOUR_STEPS.findIndex((step) => step.focus.includes(part))
}
