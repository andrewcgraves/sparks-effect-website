import { isochroneLegend } from '../composables/useIsochroneLayer'
import { TOUR_SAMPLE, reachedStation, stationNamed } from '../fixtures/tourSample'
import type { KeySwatchKind } from './keySwatchPaint'
import { remainingSecsOf, wholeMinutes } from './timeRemaining'
import type { TourCamera, TourPart } from './tourHighlight'

export type TourStepId = 'start' | 'starter-walk' | 'origin-reach' | 'ridden' | 'egress' | 'unfinished' | 'unridden'

export interface TourStep {
  id: TourStepId
  name: string
  swatch: KeySwatchKind
  caption: string
  lit: readonly TourPart[]
  camera: TourCamera
}

type KeySource = 'origin' | 'egress' | 'starter' | 'unfinished'

const KEY = Object.fromEntries(
  // The key's own labels, so a step and the map it explains never name the
  // same thing two ways.
  isochroneLegend({ unfinished: true, starterWalk: true }).map((entry) => [entry.source, entry.label]),
) as Record<KeySource, string>

const palmdaleMins = wholeMinutes(remainingSecsOf(reachedStation('palmdale')))

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'start',
    name: 'Starting point',
    swatch: 'start',
    caption: `Where the trip starts: an address you searched for, your location, or a point you picked on the map. This one starts in ${TOUR_SAMPLE.start.label.split(',')[0]}, with ${TOUR_SAMPLE.budget_mins} minutes by Transit.`,
    lit: ['origin-marker'],
    camera: 'start',
  },
  {
    id: 'starter-walk',
    name: KEY.starter,
    swatch: 'starter',
    caption: 'The way to the station you could reach first. Every other station in reach was tried too, and what they lead to is already shaded.',
    lit: ['origin-walk', 'origin-marker', 'station-dots'],
    camera: 'start',
  },
  {
    id: 'origin-reach',
    name: KEY.origin,
    swatch: 'origin',
    caption: 'Everywhere you could get from the start within your travel time by your mode alone (walking, biking, driving or local transit) without boarding the line.',
    lit: ['origin-fill', 'origin-marker'],
    camera: 'regional',
  },
  {
    id: 'ridden',
    name: 'Ridden',
    swatch: 'ridden',
    caption: 'The stretches of the line a trip rides end to end, from one station to the next. A station filled orange is one the trip reaches in time; a white one it doesn’t.',
    lit: ['ridden-line', 'station-dots'],
    camera: 'regional',
  },
  {
    id: 'egress',
    name: KEY.egress,
    swatch: 'egress',
    caption: `Everywhere you could get after stepping off at a station, heading out the same way with the minutes left, so ${stationNamed('palmdale').name}, reached with ${palmdaleMins} minutes to spare, reaches only a little way. Where areas overlap the colour deepens, and on your own map, pointing at a station picks out its area.`,
    lit: ['egress-fill', 'station-dots'],
    camera: 'egress',
  },
  {
    id: 'unfinished',
    name: 'Unfinished',
    swatch: 'unfinished',
    caption: `A ride the time ran out partway through; the dot, “${KEY.unfinished}” in the key, marks where, and it isn’t a station. On your own map, point at the dot to see how far short the ride fell.`,
    lit: ['progress', 'route-line'],
    camera: 'progress',
  },
  {
    id: 'unridden',
    name: 'Unridden',
    swatch: 'unridden',
    caption: 'The rest of the network, which no trip here rides from one station to the next. Before you plot anything, the whole network is drawn in black.',
    lit: ['route-line'],
    camera: 'network',
  },
]
