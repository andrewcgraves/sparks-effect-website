// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { chainageAlong } from './chainage'
import { validationFaultsSentence } from './api/authoringFault'
import type { RouteInput } from './api/authoring/types'
import {
  GeoJsonImportError,
  MULTI_LINE_IMPORT_FAULT,
  formatKm,
  normaliseImportedGeoJson,
  routeLengthM,
  validateRouteInput,
} from './routeGeometry'

const sfToSj: [number, number][] = [[-122.4194, 37.7749], [-121.8863, 37.3382]]

function input(overrides: Partial<RouteInput> = {}, properties: Partial<RouteInput['properties']> = {}): RouteInput {
  return {
    type: 'LineString',
    coordinates: sfToSj,
    properties: { name: 'Main Line', mode: 'rail', ...properties },
    ...overrides,
  }
}

function rules(faults: { field: string; rule: string; index?: number }[]): string[] {
  return faults.map((f) => `${f.field}${f.index === undefined ? '' : `[${f.index}]`}:${f.rule}`)
}

describe('validateRouteInput', () => {
  it('accepts a two-point line with a name and a known mode', () => {
    expect(validateRouteInput(input())).toEqual([])
  })

  it('wants the geometry to be a LineString', () => {
    expect(rules(validateRouteInput(input({ type: 'Point' as 'LineString' })))).toEqual(['type:type'])
  })

  it('wants at least two points', () => {
    expect(rules(validateRouteInput(input({ coordinates: [sfToSj[0]] })))).toEqual(['coordinates:min_count'])
  })

  it('wants each position to be a longitude and latitude pair', () => {
    expect(rules(validateRouteInput(input({ coordinates: [sfToSj[0], [-121.9, 37.3, 12]] })))).toEqual(['coordinates[1]:count'])
  })

  it('names the longitude and latitude that are out of range, as the API does', () => {
    expect(rules(validateRouteInput(input({ coordinates: [sfToSj[0], [181, 91]] })))).toEqual([
      'coordinates.lng[1]:range',
      'coordinates.lat[1]:range',
    ])
  })

  it('flags a repeated point as a zero-length span', () => {
    expect(rules(validateRouteInput(input({ coordinates: [sfToSj[0], sfToSj[0], sfToSj[1]] })))).toEqual(['coordinates[1]:zero_length'])
  })

  it('requires a name, ignoring whitespace', () => {
    expect(rules(validateRouteInput(input({}, { name: '   ' })))).toEqual(['name:required'])
  })

  it('accepts an empty mode and rejects one it does not know', () => {
    expect(validateRouteInput(input({}, { mode: '' }))).toEqual([])
    expect(rules(validateRouteInput(input({}, { mode: 'hoverboard' })))).toEqual(['mode:unknown'])
  })

  it('checks segments count the gaps between points and sit in range', () => {
    const tangent = { cant_mm: 0, curve_radius_m: 0, grade_pct: 0 }
    expect(validateRouteInput(input({}, { segments: [tangent] }))).toEqual([])
    expect(rules(validateRouteInput(input({}, { segments: [tangent, tangent] })))).toEqual(['segments:count'])
    expect(rules(validateRouteInput(input({}, { segments: [{ cant_mm: 301, curve_radius_m: 5, grade_pct: -16 }] })))).toEqual([
      'segments.cant_mm[0]:range',
      'segments.curve_radius_m[0]:range',
      'segments.grade_pct[0]:range',
    ])
  })

  it('reads in the same words as a fault the API sends back', () => {
    const faults = validateRouteInput(input({ coordinates: [sfToSj[0]] }, { name: '' }))
    expect(validationFaultsSentence(faults)).toBe('The route needs at least two points. Name is required.')
  })
})

describe('normaliseImportedGeoJson', () => {
  const line = { type: 'LineString', coordinates: [[-122.4194, 37.7749, 10], [-121.8863, 37.3382, 12]] }

  it('reads a bare LineString, dropping altitude', () => {
    expect(normaliseImportedGeoJson(JSON.stringify(line))).toEqual(sfToSj)
  })

  it('reads a Feature wrapping a LineString', () => {
    expect(normaliseImportedGeoJson(JSON.stringify({ type: 'Feature', properties: {}, geometry: line }))).toEqual(sfToSj)
  })

  it('reads a FeatureCollection holding exactly one line, ignoring its points', () => {
    const collection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', properties: {}, geometry: line },
      ],
    }
    expect(normaliseImportedGeoJson(JSON.stringify(collection))).toEqual(sfToSj)
  })

  it('drops consecutive repeated points', () => {
    const doubled = { type: 'LineString', coordinates: [sfToSj[0], sfToSj[0], sfToSj[1], sfToSj[1]] }
    expect(normaliseImportedGeoJson(JSON.stringify(doubled))).toEqual(sfToSj)
  })

  it('refuses a MultiLineString for now', () => {
    const multi = { type: 'MultiLineString', coordinates: [sfToSj, sfToSj] }
    expect(() => normaliseImportedGeoJson(JSON.stringify(multi))).toThrow(MULTI_LINE_IMPORT_FAULT)
  })

  it('refuses a collection with more than one line, saying how many', () => {
    const collection = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: line }, { type: 'Feature', geometry: line }] }
    expect(() => normaliseImportedGeoJson(JSON.stringify(collection))).toThrow('This GeoJSON holds 2 lines. Import one at a time.')
  })

  it('refuses a collection with no line', () => {
    const collection = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } }] }
    expect(() => normaliseImportedGeoJson(JSON.stringify(collection))).toThrow('No line found in this GeoJSON.')
  })

  it('refuses a geometry that is not a line, naming what it is', () => {
    expect(() => normaliseImportedGeoJson(JSON.stringify({ type: 'Polygon', coordinates: [] }))).toThrow('This GeoJSON is a Polygon, not a line.')
  })

  it('refuses text that is not JSON with a typed error', () => {
    expect(() => normaliseImportedGeoJson('not json')).toThrow(GeoJsonImportError)
    expect(() => normaliseImportedGeoJson('not json')).toThrow("This isn't valid JSON.")
  })

  it('names the point that is not a longitude and latitude pair', () => {
    const bad = { type: 'LineString', coordinates: [sfToSj[0], ['x', 37]] }
    expect(() => normaliseImportedGeoJson(JSON.stringify(bad))).toThrow("Point 2 isn't a longitude and latitude pair.")
  })
})

describe('routeLengthM', () => {
  it('is the chainage at the last point', () => {
    const chainage = chainageAlong(sfToSj)
    expect(routeLengthM(sfToSj)).toBe(chainage[chainage.length - 1])
    expect(routeLengthM(sfToSj)).toBeGreaterThan(60000)
    expect(routeLengthM(sfToSj)).toBeLessThan(70000)
  })

  it('is zero for fewer than two points', () => {
    expect(routeLengthM([])).toBe(0)
    expect(routeLengthM([sfToSj[0]])).toBe(0)
  })
})

describe('formatKm', () => {
  it('reads to one decimal in km', () => {
    expect(formatKm(60450)).toBe('60.5 km')
    expect(formatKm(0)).toBe('0.0 km')
  })

  it('is empty for a length the API did not send', () => {
    expect(formatKm(undefined)).toBe('')
  })
})
