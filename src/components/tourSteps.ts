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
    caption: `Where the trip begins. This one starts in ${TOUR_SAMPLE.start.label.split(',')[0]}, with ${TOUR_SAMPLE.budget_mins} minutes by Transit.`,
    lit: ['origin-marker'],
    camera: 'start',
  },
  {
    id: 'starter-walk',
    name: KEY.starter,
    swatch: 'starter',
    caption: 'The way to the station you could reach first. Other stations in reach count too.',
    lit: ['origin-walk', 'origin-marker', 'station-dots'],
    camera: 'start',
  },
  {
    id: 'origin-reach',
    name: KEY.origin,
    swatch: 'origin',
    caption: 'Everywhere you could get without the line, by walking, biking, driving or local transit.',
    lit: ['origin-fill', 'origin-marker'],
    camera: 'regional',
  },
  {
    id: 'ridden',
    name: 'Ridden',
    swatch: 'ridden',
    caption: 'The parts of the line a trip rides. Coral stations are reached in time; white ones aren’t.',
    lit: ['ridden-line', 'station-dots'],
    camera: 'regional',
  },
  {
    id: 'egress',
    name: KEY.egress,
    swatch: 'egress',
    caption: `Where you could go after getting off, in the time left. ${stationNamed('palmdale').name} is reached with ${palmdaleMins} minutes to spare, so its area is small.`,
    lit: ['egress-fill', 'station-dots'],
    camera: 'egress',
  },
  {
    id: 'unfinished',
    name: 'Unfinished',
    swatch: 'unfinished',
    caption: `Where time ran out partway along the line, marked by a dot: “${KEY.unfinished}” in the key.`,
    lit: ['progress', 'route-line'],
    camera: 'progress',
  },
  {
    id: 'unridden',
    name: 'Unridden',
    swatch: 'unridden',
    caption: 'The rest of the network, which no trip here rides.',
    lit: ['route-line'],
    camera: 'network',
  },
]
