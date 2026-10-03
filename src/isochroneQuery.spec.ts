import { describe, expect, it } from 'vitest'
import { DURATION_OPTIONS, readIsochroneQuery, writeIsochroneQuery } from './isochroneQuery'

describe('readIsochroneQuery', () => {
  it('reads an origin, mode and budget', () => {
    expect(readIsochroneQuery({ at: '37.3382,-121.8863', mode: 'transit', mins: '60' })).toEqual({
      lat: 37.3382,
      lng: -121.8863,
      mode: 'transit',
      duration: 60,
    })
  })

  it('reads nothing from an empty query', () => {
    expect(readIsochroneQuery({})).toEqual({})
  })

  it.each([
    ['not a pair', 'nonsense'],
    ['three parts', '1,2,3'],
    ['a trailing letter', '37.3x,-121.8'],
    ['an empty half', '37.3,'],
    ['latitude past a pole', '91,0'],
    ['longitude past the antimeridian', '0,181'],
    ['infinity', 'Infinity,0'],
  ])('ignores an origin with %s', (_, at) => {
    expect(readIsochroneQuery({ at, mode: 'walk', mins: '45' })).toEqual({ mode: 'walk', duration: 45 })
  })

  it('accepts the edges of the coordinate range', () => {
    expect(readIsochroneQuery({ at: '-90,180' })).toEqual({ lat: -90, lng: 180 })
  })

  it('ignores a mode it does not know', () => {
    expect(readIsochroneQuery({ at: '1,2', mode: 'teleport' })).toEqual({ lat: 1, lng: 2 })
  })

  it.each(['59', '60.5', 'sixty', '', '-60'])('ignores a budget of %j that is not on offer', (mins) => {
    expect(readIsochroneQuery({ mins })).toEqual({})
  })

  it('accepts every budget on offer', () => {
    for (const duration of DURATION_OPTIONS) {
      expect(readIsochroneQuery({ mins: String(duration) })).toEqual({ duration })
    }
  })

  it('ignores a key given more than once', () => {
    expect(readIsochroneQuery({ at: ['1,2', '3,4'], mode: ['walk', 'bike'], mins: ['45', '60'] })).toEqual({})
  })

  it('ignores a key given with no value', () => {
    expect(readIsochroneQuery({ at: null, mode: null, mins: null })).toEqual({})
  })
})

describe('writeIsochroneQuery', () => {
  it('writes an origin, mode and budget', () => {
    expect(writeIsochroneQuery({ lat: 37.3382, lng: -121.8863, mode: 'transit', duration: 60 })).toEqual({
      at: '37.3382,-121.8863',
      mode: 'transit',
      mins: '60',
    })
  })

  it('rounds the origin to five decimals', () => {
    expect(writeIsochroneQuery({ lat: 37.338212345, lng: -121.886349999, mode: 'walk', duration: 45 }).at).toBe(
      '37.33821,-121.88635',
    )
  })

  it('reads back what it writes', () => {
    const payload = { lat: 37.33821, lng: -121.88635, mode: 'bike' as const, duration: 120 }
    expect(readIsochroneQuery(writeIsochroneQuery(payload))).toEqual(payload)
  })
})
