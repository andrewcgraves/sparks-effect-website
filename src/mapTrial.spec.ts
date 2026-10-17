import { describe, it, expect } from 'vitest'
import { readMapTrial } from './mapTrial'

describe('readMapTrial', () => {
  it('draws the map as it always has when no switch is set', () => {
    expect(readMapTrial('')).toEqual({ splash: 'stacked', sharpness: 'full', highlight: 'dim' })
  })

  it('reads each switch from the query string', () => {
    expect(readMapTrial('?splash=flat&sharpness=adaptive&highlight=lift')).toEqual({
      splash: 'flat',
      sharpness: 'adaptive',
      highlight: 'lift',
    })
  })

  it('ignores a value it does not know', () => {
    expect(readMapTrial('?splash=wobbly&sharpness=3')).toEqual({ splash: 'stacked', sharpness: 'full', highlight: 'dim' })
  })
})
