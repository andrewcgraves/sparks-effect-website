import { trackIsochroneError, trackIsochroneRequest } from '../analytics/index'
import { checkOriginReach, outOfRangeError, outOfRangeMessage } from '../originRange'
import { ApiError } from './authoring/client'
import type { TravelMode } from './authoring/types'
import { JobFailedError } from './polling'
import { BUSY_HINT_AFTER_MS, routingBusyWait, type IsochroneProgress } from './routingJobs'
import type { Station } from './scenarios'

const GENERIC_FAULT = "Couldn't plot this travel zone. Please try again."

// Said for every failed routing job, whatever its reason: the reason is the
// API's or the worker's own text, in their words ("compile: service …
// references unknown route", "isochrone: routing unavailable"), and copy never
// prints it. A routing service that is down passes; a start it cannot route
// from does not, and the page cannot tell which this was, so it offers both.
const ROUTING_FAILED_FAULT =
  "Routing couldn't finish this travel zone. Please try again, or try a different starting point."

// Said when routing is too busy to reach this visitor's travel zone: the queue
// was full, or the job waited until it was given up on. It is the site's load,
// not their starting point, so the advice is to come back, and where the page
// has example travel zones (already plotted, no queue) to look at one now.
const BUSY_FAULT = 'Lots of people are plotting travel zones right now.'
const OPEN_AN_EXAMPLE = 'open one of the example travel zones'

const BUSY_WAIT = 'Lots of people are plotting right now, so this may take a minute…'

export interface IsochroneFaultOptions {
  hasExamples?: boolean
}

function httpStatus(err: unknown): number | null {
  if (err instanceof ApiError) return err.status
  return null
}

export function isochroneRangeRefusal(
  stations: Station[],
  origin: { lat: number; lng: number },
  mode: TravelMode,
  budgetMins: number,
): string | null {
  const reach = checkOriginReach(stations, origin, mode, budgetMins)
  if (!reach || reach.inRange) return null
  trackIsochroneError(mode, budgetMins, null)
  return outOfRangeMessage(reach, mode, budgetMins)
}

export function isochroneRequested(mode: TravelMode, budgetMins: number): void {
  trackIsochroneRequest(mode, budgetMins)
}

function busyFault(err: unknown, hasExamples: boolean): string | null {
  const wait = routingBusyWait(err)
  if (wait === null) return null
  const advice = hasExamples ? `try again in ${wait}, or ${OPEN_AN_EXAMPLE}` : `try again in ${wait}`
  return `${BUSY_FAULT} Please ${advice}.`
}

function failedJobFault(err: unknown): string | null {
  if (!(err instanceof JobFailedError)) return null
  console.warn('[isochrone] routing job failed:', err.jobError || '(no reason given)')
  return ROUTING_FAILED_FAULT
}

export function isochroneFault(
  err: unknown,
  mode: TravelMode,
  budgetMins: number,
  { hasExamples = false }: IsochroneFaultOptions = {},
): string {
  trackIsochroneError(mode, budgetMins, httpStatus(err))

  // Seeded and authored isochrones are the same worker failing the same way,
  // so they arrive in one envelope (SPA-290): ApiError for a request the API
  // refused, JobFailedError for a job it gave up on. Each translator below
  // reads the one it knows and passes on the rest.
  //
  // The API refusing the origin as out of range is a case the local pre-check
  // could not see: a station list that has gone stale, or one whose stations
  // differ from the compiled graph's nodes. Its own distances are the accurate
  // ones, so its numbers win over the generic failure.
  //
  // Busy is next: a refused enqueue (SPA-219), or a job that waited in the
  // queue until it was given up on. The request was fine and routing is
  // simply busy, so "come back" is the actual advice rather than the shrug
  // the generic message is. It goes before the failed-job fault because a job
  // given up on for waiting also arrives failed.
  //
  // A routing job that reached `failed` — the routing service being down
  // (SPA-230), or a starting point it could not route from — says so without
  // its reason, which goes to the console, not the page.
  return (
    outOfRangeError(err, mode, budgetMins) ??
    busyFault(err, hasExamples) ??
    failedJobFault(err) ??
    GENERIC_FAULT
  )
}

export function isochroneWaitMessage(progress: IsochroneProgress | null): string {
  if (progress === null) return 'Waiting…'
  if (progress.status !== 'queued') return 'Plotting…'
  const ahead = progress.queue_position
  if ((progress.waitedMs ?? 0) >= BUSY_HINT_AFTER_MS) return BUSY_WAIT
  if (ahead === undefined) return 'Waiting…'
  if (ahead === 0) return "You're next…"
  return `Waiting — ${ahead} ahead of you`
}
