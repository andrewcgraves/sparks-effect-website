import type { LocationQuery } from 'vue-router'
import { TRAVEL_MODES, type TravelMode } from './api/authoring/types'

export const DURATION_OPTIONS = [45, 60, 75, 120, 180, 240]

export interface IsochronePayload {
  lat: number
  lng: number
  mode: TravelMode
  duration: number
}

export const DEFAULT_MODE: TravelMode = 'walk'
export const DEFAULT_DURATION = 60

// A repeated key arrives as an array; neither of its values is more the
// sender's meaning than the other, so it is read as no value at all.
function single(query: LocationQuery, key: string): string | null {
  const value = query[key]
  return typeof value === 'string' ? value : null
}

// Number(), not parseFloat: "37.3x" is a typo, not 37.3.
function strictNumber(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function readOrigin(at: string | null): { lat: number; lng: number } | null {
  const parts = at?.split(',')
  if (parts?.length !== 2) return null
  const [lat, lng] = parts.map(strictNumber)
  if (lat === null || lng === null) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

// A link is a stranger's input: whatever it says that the form could not
// have said is dropped field by field, and the form falls back to its own
// defaults for it.
export function readIsochroneQuery(query: LocationQuery): Partial<IsochronePayload> {
  const payload: Partial<IsochronePayload> = {}

  const origin = readOrigin(single(query, 'at'))
  if (origin) Object.assign(payload, origin)

  const mode = single(query, 'mode')
  if (TRAVEL_MODES.includes(mode as TravelMode)) payload.mode = mode as TravelMode

  const mins = strictNumber(single(query, 'mins') ?? '')
  if (mins !== null && DURATION_OPTIONS.includes(mins)) payload.duration = mins

  return payload
}

// Five decimals is about a metre: finer than any origin means, and short
// enough to read in a pasted link.
function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(5)))
}

export function writeIsochroneQuery(payload: IsochronePayload): { at: string; mode: TravelMode; mins: string } {
  return {
    at: `${formatCoordinate(payload.lat)},${formatCoordinate(payload.lng)}`,
    mode: payload.mode,
    mins: String(payload.duration),
  }
}
