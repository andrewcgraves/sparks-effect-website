// @vitest-environment node

import { describe, it, expect } from 'vitest'
import { resolveMapStyleUrl, resolveTileCredit } from './mapStyle'

describe('resolveMapStyleUrl', () => {
  it('uses OpenFreeMap Positron when no Stadia API key is set', () => {
    expect(resolveMapStyleUrl(undefined)).toBe('https://tiles.openfreemap.org/styles/positron')
    expect(resolveMapStyleUrl('')).toBe('https://tiles.openfreemap.org/styles/positron')
    expect(resolveMapStyleUrl('   ')).toBe('https://tiles.openfreemap.org/styles/positron')
  })

  it('uses Stadia Alidade Smooth with api_key when a key is provided', () => {
    expect(resolveMapStyleUrl('test-key')).toBe(
      'https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=test-key',
    )
  })
})

describe('resolveTileCredit', () => {
  it('credits OpenFreeMap when no Stadia API key is set', () => {
    expect(resolveTileCredit(undefined)).toEqual({ name: 'OpenFreeMap', href: 'https://openfreemap.org' })
    expect(resolveTileCredit('   ')).toEqual({ name: 'OpenFreeMap', href: 'https://openfreemap.org' })
  })

  it('credits Stadia Maps when a key is provided', () => {
    expect(resolveTileCredit('test-key')).toEqual({ name: 'Stadia Maps', href: 'https://stadiamaps.com' })
  })
})
