import type { VehicleParams } from '../api/authoring/types'

export type VehiclePresetId = 'high_speed_rail' | 'regional_rail' | 'light_rail' | 'brt_bus'

export interface VehiclePreset {
  id: VehiclePresetId
  label: string
  vehicle: VehicleParams
}

// Starting points, not a catalog: the authored model inlines these four numbers
// rather than naming a vehicle type (SPA-122 is the catalog). High-speed rail
// is the seeded CA HSR Siemens Venture EMU, dwell being its level-boarding
// figure; the other three are representative of their class and still awaiting
// confirmation (SPA-401).
export const VEHICLE_PRESETS: readonly VehiclePreset[] = [
  {
    id: 'high_speed_rail',
    label: 'High-speed rail',
    vehicle: { max_speed_kmh: 320, acceleration_ms2: 0.5, deceleration_ms2: 0.65, dwell_s: 90 },
  },
  {
    id: 'regional_rail',
    label: 'Regional rail',
    vehicle: { max_speed_kmh: 177, acceleration_ms2: 0.6, deceleration_ms2: 0.7, dwell_s: 45 },
  },
  {
    id: 'light_rail',
    label: 'Light rail',
    vehicle: { max_speed_kmh: 90, acceleration_ms2: 1.0, deceleration_ms2: 1.2, dwell_s: 25 },
  },
  {
    id: 'brt_bus',
    label: 'BRT / bus',
    vehicle: { max_speed_kmh: 80, acceleration_ms2: 1.2, deceleration_ms2: 1.3, dwell_s: 20 },
  },
]

const VEHICLE_FIELDS: readonly (keyof VehicleParams)[] = [
  'max_speed_kmh',
  'acceleration_ms2',
  'deceleration_ms2',
  'dwell_s',
]

export function presetVehicle(id: VehiclePresetId): VehicleParams {
  const preset = VEHICLE_PRESETS.find((candidate) => candidate.id === id)!
  return { ...preset.vehicle }
}

export function matchingPreset(vehicle: VehicleParams): VehiclePresetId | null {
  const match = VEHICLE_PRESETS.find((preset) =>
    VEHICLE_FIELDS.every((field) => preset.vehicle[field] === vehicle[field]),
  )
  return match?.id ?? null
}

export type SpeedUnit = 'kmh' | 'mph'

const KM_PER_MILE = 1.609344

function toTenth(value: number): number {
  return Math.round(value * 10) / 10
}

// Both directions round to a tenth. A number input bound to a converted value
// is rewritten from the store on every keystroke, so a typed mph figure has to
// survive mph → km/h → mph unchanged or the field jumps under the author; at a
// tenth of a unit each way it does, and a tenth of a km/h is finer than any
// timetable cares about.
export function kmhToMph(kmh: number): number {
  return toTenth(kmh / KM_PER_MILE)
}

// Prefers the whole km/h that shows as the mph typed, when there is one: a
// preset's 320 km/h reads as 198.8 mph, and an author who retypes that 198.8
// should get 320 back, not 319.9 and a vehicle that no longer matches it.
export function mphToKmh(mph: number): number {
  const kmh = mph * KM_PER_MILE
  const whole = Math.round(kmh)
  return kmhToMph(whole) === mph ? whole : toTenth(kmh)
}

// Soft ranges: a figure outside them is almost always a typo or a unit mix-up,
// but the API accepts it and so does the form. The floor is the one thing the
// API refuses — above zero for the three motion figures, not negative for
// dwell — and canSubmit holds the save back for it, so that message says why
// the button is dead rather than adding a block of its own.
type Floor = 'positive' | 'non_negative'

interface SoftRange {
  floor: Floor
  low: number
  high: number
  tooLow?: string
  tooHigh: string
}

const REFUSED: Record<Floor, string> = {
  positive: 'Must be above zero',
  non_negative: "Can't be negative",
}

const SOFT_RANGES: Record<keyof VehicleParams, SoftRange> = {
  max_speed_kmh: {
    floor: 'positive',
    low: 20,
    high: 400,
    tooLow: 'Slower than city traffic',
    tooHigh: 'Faster than any passenger rail in service',
  },
  acceleration_ms2: {
    floor: 'positive',
    low: 0.2,
    high: 1.5,
    tooLow: 'Lower than most passenger rail',
    tooHigh: 'Higher than most passenger rail',
  },
  deceleration_ms2: {
    floor: 'positive',
    low: 0.2,
    high: 1.5,
    tooLow: 'Lower than most passenger rail',
    tooHigh: 'Harder than a normal station stop',
  },
  dwell_s: {
    floor: 'non_negative',
    low: 0,
    high: 300,
    tooHigh: 'Longer than most station stops',
  },
}

export type VehicleWarnings = Partial<Record<keyof VehicleParams, string>>

export function vehicleWarnings(vehicle: VehicleParams): VehicleWarnings {
  const warnings: VehicleWarnings = {}
  for (const field of VEHICLE_FIELDS) {
    const value = vehicle[field]
    const { floor, low, high, tooLow, tooHigh } = SOFT_RANGES[field]
    const refused = floor === 'positive' ? value <= 0 : value < 0
    if (refused) warnings[field] = REFUSED[floor]
    else if (tooLow && value < low) warnings[field] = tooLow
    else if (value > high) warnings[field] = tooHigh
  }
  return warnings
}

const SPEED_HELP: Record<SpeedUnit, string> = {
  kmh: 'Top speed between stops; a bus runs about 80 km/h, high-speed rail 300 km/h or more',
  mph: 'Top speed between stops; a bus runs about 50 mph, high-speed rail 185 mph or more',
}

const FIELD_HELP: Record<Exclude<keyof VehicleParams, 'max_speed_kmh'>, string> = {
  acceleration_ms2: 'How quickly it speeds up; 0.3–1.2 m/s² is typical for passenger rail',
  deceleration_ms2: 'How quickly it slows for a stop; 0.4–1.3 m/s² is typical for passenger rail',
  dwell_s: 'Time stopped at each station for boarding; 20–90 s is typical',
}

export function vehicleFieldHelp(field: keyof VehicleParams, unit: SpeedUnit): string {
  return field === 'max_speed_kmh' ? SPEED_HELP[unit] : FIELD_HELP[field]
}
