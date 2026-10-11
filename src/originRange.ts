import { ApiError } from './api/authoring/client'
import type { TravelMode } from './api/authoring/types'
import type { Station } from './api/scenarios'
import { MODE_TRIPS } from './copy/modes'
import { UNNAMED_STATION } from './copy/names'

export const ORIGIN_OUT_OF_RANGE_CODE = 'origin_out_of_range'

const SPEED_KMH: Record<TravelMode, number> = {
  walk: 5,
  bike: 15,
  drive: 80,
  transit: 40,
}

const EARTH_RADIUS_KM = 6371

export function reachKm(mode: TravelMode, budgetMins: number): number {
  if (budgetMins <= 0) return 0
  return (SPEED_KMH[mode] * budgetMins) / 60
}

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

export interface OriginReach {
  nearestName: string
  nearestKm: number
  maxReachKm: number
  inRange: boolean
}

export function checkOriginReach(
  stations: Station[],
  origin: { lat: number; lng: number },
  mode: TravelMode,
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
      nearestName = station.name || UNNAMED_STATION
    }
  }

  return { nearestName, nearestKm, maxReachKm, inRange: nearestKm <= maxReachKm }
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export function outOfRangeMessage(
  reach: Pick<OriginReach, 'nearestKm' | 'maxReachKm'>,
  mode: TravelMode,
  budgetMins: number,
): string {
  return (
    `The nearest station is about ${formatKm(reach.nearestKm)} away, ` +
    `further than a ${budgetMins}-minute ${MODE_TRIPS[mode]} can reach ` +
    `(${formatKm(reach.maxReachKm)}). Move the starting point closer to the line, ` +
    `or raise the travel time.`
  )
}

const OUT_OF_RANGE_FALLBACK =
  'Every station is further than this travel time can reach. ' +
  'Move the starting point closer to the line, or raise the travel time.'

function distances(detail: unknown): Pick<OriginReach, 'nearestKm' | 'maxReachKm'> | null {
  if (typeof detail !== 'object' || detail === null) return null
  const { nearest_station_km: nearestKm, max_reach_km: maxReachKm } =
    detail as { nearest_station_km?: unknown; max_reach_km?: unknown }
  if (typeof nearestKm !== 'number' || typeof maxReachKm !== 'number') return null
  return { nearestKm, maxReachKm }
}

export function outOfRangeError(err: unknown, mode: TravelMode, budgetMins: number): string | null {
  if (!(err instanceof ApiError) || err.code !== ORIGIN_OUT_OF_RANGE_CODE) return null

  const reach = distances(err.detail)
  if (reach) return outOfRangeMessage(reach, mode, budgetMins)
  // The code alone is enough to say what went wrong; the message is the API's
  // request line and its own words, so it goes to the console, not the page.
  console.warn('[isochrone] origin_out_of_range without distances:', err.message)
  return OUT_OF_RANGE_FALLBACK
}
