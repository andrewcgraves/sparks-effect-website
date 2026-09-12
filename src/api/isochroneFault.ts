import { trackIsochroneError, trackIsochroneRequest } from '../analytics/index'
import { checkOriginReach, outOfRangeError, outOfRangeMessage, type Mode } from '../originRange'
import { ApiError } from './authoring/client'
import { JobFailedError } from './polling'
import { backlogFullError } from './routingJobs'
import type { Station } from './scenarios'

const GENERIC_FAULT = 'Failed to generate isochrone. Please try again.'

function httpStatus(err: unknown): number | null {
  if (err instanceof ApiError) return err.status
  return null
}

export function isochroneRangeRefusal(
  stations: Station[],
  origin: { lat: number; lng: number },
  mode: Mode,
  budgetMins: number,
): string | null {
  const reach = checkOriginReach(stations, origin, mode, budgetMins)
  if (!reach || reach.inRange) return null
  trackIsochroneError(mode, budgetMins, null)
  return outOfRangeMessage(reach, mode, budgetMins)
}

export function isochroneRequested(mode: Mode, budgetMins: number): void {
  trackIsochroneRequest(mode, budgetMins)
}

export function isochroneFault(err: unknown, mode: Mode, budgetMins: number): string {
  trackIsochroneError(mode, budgetMins, httpStatus(err))

  // Seeded and authored isochrones are the same worker failing the same way,
  // so they arrive in one envelope (SPA-290): ApiError for a request the API
  // refused, JobFailedError for a job it gave up on. Each translator below
  // reads the one it knows and passes on the rest.
  //
  // The API refusing the origin as out of range is a case the local pre-check
  // could not see: a station list that has gone stale, or one whose stations
  // differ from the compiled graph's nodes. Its own distances are the accurate
  // ones, so its message wins over the generic failure.
  //
  // A refused enqueue (SPA-219) is next: the request was fine and the service
  // is simply busy, so "try again" is the actual advice rather than the shrug
  // the generic message is.
  //
  // A routing job that reached `failed` — the isochrone service being down
  // chief among the reasons (SPA-230) — carries its own reason from the API
  // too, and that wins the same way: it says something a generic "try again"
  // cannot, like whether trying again is even worth it right now.
  return (
    outOfRangeError(err, mode, budgetMins) ??
    backlogFullError(err) ??
    (err instanceof JobFailedError ? err.jobError || null : null) ??
    GENERIC_FAULT
  )
}
