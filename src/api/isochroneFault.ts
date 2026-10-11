import { trackIsochroneError, trackIsochroneRequest } from '../analytics/index'
import { checkOriginReach, outOfRangeError, outOfRangeMessage } from '../originRange'
import { ApiError } from './authoring/client'
import type { TravelMode } from './authoring/types'
import { JobFailedError } from './polling'
import { backlogFullError, type IsochroneProgress } from './routingJobs'
import type { Station } from './scenarios'

const GENERIC_FAULT = "Couldn't plot this splash zone. Please try again."

// Said for every failed routing job, whatever its reason: the reason is the
// API's or the worker's own text, in their words ("compile: service …
// references unknown route", "isochrone: routing unavailable"), and copy never
// prints it. A routing service that is down passes; a start it cannot route
// from does not, and the page cannot tell which this was, so it offers both.
const ROUTING_FAILED_FAULT =
  "Routing couldn't finish this splash zone. Please try again, or try a different starting point."

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

function failedJobFault(err: unknown): string | null {
  if (!(err instanceof JobFailedError)) return null
  console.warn('[isochrone] routing job failed:', err.jobError || '(no reason given)')
  return ROUTING_FAILED_FAULT
}

export function isochroneFault(err: unknown, mode: TravelMode, budgetMins: number): string {
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
  // A refused enqueue (SPA-219) is next: the request was fine and routing is
  // simply busy, so "try again" is the actual advice rather than the shrug
  // the generic message is.
  //
  // A routing job that reached `failed` — the routing service being down
  // (SPA-230), or a starting point it could not route from — says so without
  // its reason, which goes to the console, not the page.
  return (
    outOfRangeError(err, mode, budgetMins) ??
    backlogFullError(err) ??
    failedJobFault(err) ??
    GENERIC_FAULT
  )
}

export function isochroneWaitMessage(progress: IsochroneProgress | null): string {
  if (progress === null) return 'Waiting…'
  if (progress.status !== 'queued') return 'Plotting…'
  const ahead = progress.queue_position
  if (ahead === undefined) return 'Waiting…'
  if (ahead === 0) return "You're next…"
  return `Waiting — ${ahead} ahead of you`
}
