// Whether an origin is close enough to any station for an isochrone to be
// worth asking for (SPA-200).
//
// This is a courtesy, not a guard. The API runs the same check before it
// enqueues anything and answers 422 with `origin_out_of_range` when it fails —
// that is the one that protects the service, since /api/isochrone is public and
// nothing here is binding on a caller who skips the page. What this buys is the
// answer arriving instantly and in words, instead of after a round trip.
import { ApiError } from './api/authoring/client'
import type { TravelMode } from './api/authoring/types'
import type { Station } from './api/scenarios'

export type Mode = TravelMode

// The code the API tags an out-of-range refusal with.
export const ORIGIN_OUT_OF_RANGE_CODE = 'origin_out_of_range'

// Assumed travel speeds, km/h.
//
// The same numbers as sparks-effect-api's internal/geo and the routing
// worker's, and they have to stay the same numbers: this decides what to tell
// the user before asking, the API decides what to refuse, and the worker decides
// which stations are worth a routing call. If this copy drifts high the page
// lets through requests the API then refuses — recoverable, since the 422 is
// handled — and if it drifts low the page refuses requests that would have
// plotted, which is the failure worth avoiding.
//
// Transit is the one that is a decision rather than a physical constant: a
// blended door-to-door pace for walking plus local transit, chosen in SPA-246.
// Record<Mode, …> is what makes a fifth mode a compile error here rather than a
// silently zero radius.
const SPEED_KMH: Record<Mode, number> = {
  walk: 5,
  bike: 15,
  drive: 80,
  transit: 40,
}

const EARTH_RADIUS_KM = 6371

/**
 * The furthest a traveller could possibly get in `budgetMins`, as a straight
 * line.
 *
 * A bound on what is possible, not an estimate of what is likely. The routing
 * worker divides the same product by a detour factor because roads are longer
 * than the line they follow, but that is right for deciding which stations are
 * worth a routing call and wrong for deciding whether to refuse someone: a
 * great-circle distance is a floor no street network can undercut, so anything
 * outside this radius is provably unreachable and anything inside it may well
 * not be.
 */
export function reachKm(mode: Mode, budgetMins: number): number {
  if (budgetMins <= 0) return 0
  return (SPEED_KMH[mode] * budgetMins) / 60
}

// Great-circle distance between two WGS84 points.
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLng = (bLng - aLng) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// How an origin stands in relation to a set of stations.
export interface OriginReach {
  nearestName: string
  nearestKm: number
  maxReachKm: number
  inRange: boolean
}

/**
 * Reports whether any of `stations` is close enough to the origin, or null when
 * the question cannot be asked.
 *
 * Null for an empty station list, because a page that has not loaded its
 * scenario yet — or one whose scenario genuinely has no stations — knows nothing
 * about how far away the origin is, and must not refuse on that basis. The
 * request goes to the API, which decides with the compiled graph in front of it.
 *
 * The stations here are the scenario's, while the API measures against the
 * compiled graph's nodes. They differ slightly: co-located stops are merged into
 * one node at compile time, and a station no service calls at is not a node at
 * all. Both differences make this the more permissive of the two, which is the
 * right way round — the worst case is a request the API refuses with a 422 this
 * module also has a message for.
 */
export function checkOriginReach(
  stations: Station[],
  origin: { lat: number; lng: number },
  mode: Mode,
  budgetMins: number,
): OriginReach | null {
  if (stations.length === 0) return null

  const maxReachKm = reachKm(mode, budgetMins)

  let nearestKm = Infinity
  let nearestName = ''
  for (const station of stations) {
    const [lng, lat] = station.location.coordinates
    const km = haversineKm(origin.lat, origin.lng, lat, lng)
    if (km < nearestKm) {
      nearestKm = km
      nearestName = station.name || station.slug
    }
  }

  return { nearestName, nearestKm, maxReachKm, inRange: nearestKm <= maxReachKm }
}

// Distances read as a person would say them: a station 800 m away is not "0.8
// km", and one 111.194 km away is not that precise in any sense that matters.
function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

const MODE_VERB: Record<Mode, string> = {
  walk: 'walk',
  bike: 'ride',
  drive: 'drive',
  transit: 'transit trip',
}

/**
 * The sentence shown when an origin is out of range.
 *
 * It names the distance and the two things that would fix it, because "too far"
 * on its own leaves the user guessing which of the pin, the mode and the travel
 * time to change — and from a map they cannot tell whether they are 2 km out or
 * 200.
 */
export function outOfRangeMessage(
  reach: Pick<OriginReach, 'nearestKm' | 'maxReachKm'>,
  mode: Mode,
  budgetMins: number,
): string {
  return (
    `The nearest station is about ${formatKm(reach.nearestKm)} away, ` +
    `further than a ${budgetMins}-minute ${MODE_VERB[mode]} can reach ` +
    `(${formatKm(reach.maxReachKm)}). Move the pin closer to the line, ` +
    `or raise the travel time.`
  )
}

/**
 * The same sentence, from the API's refusal rather than from a local check.
 *
 * Returns null for anything that is not an out-of-range 422 — a different code,
 * a detail that does not hold up — because the caller's fallback is its usual
 * "please try again", and that is strictly better than inventing a distance.
 * This is the path that catches what the local check could not see: a stale
 * station list, a direct caller, or the graph and the scenario disagreeing.
 */
export function outOfRangeError(err: unknown, mode: Mode, budgetMins: number): string | null {
  if (!(err instanceof ApiError) || err.code !== ORIGIN_OUT_OF_RANGE_CODE) return null

  const detail = err.detail as { nearest_station_km?: unknown; max_reach_km?: unknown } | null
  if (typeof detail !== 'object' || detail === null) return err.message
  const { nearest_station_km: nearestKm, max_reach_km: maxReachKm } = detail
  if (typeof nearestKm !== 'number' || typeof maxReachKm !== 'number') return err.message

  return outOfRangeMessage({ nearestKm, maxReachKm }, mode, budgetMins)
}
