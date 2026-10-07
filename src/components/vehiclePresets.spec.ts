// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  VEHICLE_PRESETS,
  kmhToMph,
  matchingPreset,
  mphToKmh,
  presetVehicle,
  vehicleFieldHelp,
  vehicleWarnings,
} from './vehiclePresets'

describe('VEHICLE_PRESETS', () => {
  it('offers the four presets in order from fastest to slowest', () => {
    expect(VEHICLE_PRESETS.map((preset) => preset.label)).toEqual([
      'High-speed rail',
      'Regional rail',
      'Light rail',
      'BRT / bus',
    ])
  })

  it('anchors high-speed rail on the seeded CA HSR vehicle', () => {
    // sparks-effect-api/internal/transit/data/scenarios/ca-hsr/vehicle_types.yaml,
    // Siemens Venture EMU: 320 km/h, 0.5 / 0.65 m/s², 90 s level-boarding dwell.
    expect(presetVehicle('high_speed_rail')).toEqual({
      max_speed_kmh: 320,
      acceleration_ms2: 0.5,
      deceleration_ms2: 0.65,
      dwell_s: 90,
    })
  })

  it('gives every preset a copy of its own, so editing a filled form cannot rewrite the preset', () => {
    const first = presetVehicle('light_rail')
    first.max_speed_kmh = 1
    expect(presetVehicle('light_rail').max_speed_kmh).toBe(90)
  })
})

describe('matchingPreset', () => {
  it('names the preset whose four values a vehicle equals', () => {
    expect(matchingPreset({ max_speed_kmh: 177, acceleration_ms2: 0.6, deceleration_ms2: 0.7, dwell_s: 45 })).toBe('regional_rail')
  })

  it('is null when any one value differs', () => {
    expect(matchingPreset({ max_speed_kmh: 177, acceleration_ms2: 0.6, deceleration_ms2: 0.7, dwell_s: 46 })).toBeNull()
  })
})

describe('speed units', () => {
  it('shows 320 km/h as 198.8 mph', () => {
    expect(kmhToMph(320)).toBe(198.8)
  })

  it('stores 110 mph as 177 km/h', () => {
    expect(mphToKmh(110)).toBe(177)
  })

  it('round-trips a typed mph figure without drifting, so the field does not rewrite itself under the author', () => {
    for (const mph of [50, 55.9, 110, 125.4, 200]) {
      expect(kmhToMph(mphToKmh(mph))).toBe(mph)
    }
  })
})

describe('vehicleWarnings', () => {
  const regional = presetVehicle('regional_rail')

  it('has nothing to say about a preset', () => {
    expect(vehicleWarnings(regional)).toEqual({})
  })

  it('warns, per field, about values outside what passenger services run', () => {
    expect(vehicleWarnings({ max_speed_kmh: 450, acceleration_ms2: 1.6, deceleration_ms2: 2, dwell_s: 400 })).toEqual({
      max_speed_kmh: 'Faster than any passenger rail in service',
      acceleration_ms2: 'Higher than most passenger rail',
      deceleration_ms2: 'Harder than a normal service stop',
      dwell_s: 'Longer than most station stops',
    })
  })

  it('warns about values too small to be a vehicle', () => {
    expect(vehicleWarnings({ max_speed_kmh: 10, acceleration_ms2: 0.1, deceleration_ms2: 0.1, dwell_s: 0 })).toEqual({
      max_speed_kmh: 'Slower than city traffic',
      acceleration_ms2: 'Lower than most passenger rail',
      deceleration_ms2: 'Lower than most passenger rail',
    })
  })

  it('says why a value the API would reject cannot be saved', () => {
    expect(vehicleWarnings({ max_speed_kmh: 0, acceleration_ms2: 0, deceleration_ms2: -1, dwell_s: -5 })).toEqual({
      max_speed_kmh: 'Must be above zero',
      acceleration_ms2: 'Must be above zero',
      deceleration_ms2: 'Must be above zero',
      dwell_s: "Can't be negative",
    })
  })

  it('accepts the edges of each typical range without a warning', () => {
    expect(vehicleWarnings({ max_speed_kmh: 400, acceleration_ms2: 1.5, deceleration_ms2: 1.5, dwell_s: 300 })).toEqual({})
    expect(vehicleWarnings({ max_speed_kmh: 20, acceleration_ms2: 0.2, deceleration_ms2: 0.2, dwell_s: 0 })).toEqual({})
  })
})

describe('vehicleFieldHelp', () => {
  it('explains each field in one line', () => {
    expect(vehicleFieldHelp('acceleration_ms2', 'kmh')).toBe(
      'How quickly it speeds up; 0.3–1.2 m/s² is typical for passenger rail',
    )
    expect(vehicleFieldHelp('deceleration_ms2', 'kmh')).toBe(
      'How quickly it slows for a stop; 0.4–1.3 m/s² is typical for passenger rail',
    )
    expect(vehicleFieldHelp('dwell_s', 'kmh')).toBe(
      'Time stopped at each station for boarding; 20–90 s is typical',
    )
  })

  it('quotes the speed examples in the unit being shown', () => {
    expect(vehicleFieldHelp('max_speed_kmh', 'kmh')).toBe(
      'Top speed between stops; a bus runs about 80 km/h, high-speed rail 300 km/h or more',
    )
    expect(vehicleFieldHelp('max_speed_kmh', 'mph')).toBe(
      'Top speed between stops; a bus runs about 50 mph, high-speed rail 185 mph or more',
    )
  })
})
