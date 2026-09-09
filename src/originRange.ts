import { ApiError } from './api/authoring/client'
import type { TravelMode } from './api/authoring/types'
import type { Station } from './api/scenarios'

export type Mode = TravelMode

export const ORIGIN_OUT_OF_RANGE_CODE = 'origin_out_of_range'

const SPEED_KMH: Record<Mode, number> = {
  walk: 5,
  bike: 15,
  drive: 80,
  transit: 40,
}

const EARTH_RADIUS_KM = 6371

export function reachKm(mode: Mode, budgetMins: number): number {
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

export function outOfRangeError(err: unknown, mode: Mode, budgetMins: number): string | null {
  if (!(err instanceof ApiError) || err.code !== ORIGIN_OUT_OF_RANGE_CODE) return null

  const detail = err.detail as { nearest_station_km?: unknown; max_reach_km?: unknown } | null
  if (typeof detail !== 'object' || detail === null) return err.message
  const { nearest_station_km: nearestKm, max_reach_km: maxReachKm } = detail
  if (typeof nearestKm !== 'number' || typeof maxReachKm !== 'number') return err.message

  return outOfRangeMessage({ nearestKm, maxReachKm }, mode, budgetMins)
}
