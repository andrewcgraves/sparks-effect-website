import { describe, it, expect } from 'vitest'
import { resolveMapStyleUrl } from './mapStyle'

describe('resolveMapStyleUrl', () => {
  it('uses OpenFreeMap when no Stadia API key is set', () => {
    expect(resolveMapStyleUrl(undefined)).toBe('https://tiles.openfreemap.org/styles/liberty')
    expect(resolveMapStyleUrl('')).toBe('https://tiles.openfreemap.org/styles/liberty')
    expect(resolveMapStyleUrl('   ')).toBe('https://tiles.openfreemap.org/styles/liberty')
  })

  it('uses Stadia Alidade Smooth with api_key when a key is provided', () => {
    expect(resolveMapStyleUrl('test-key')).toBe(
      'https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=test-key',
    )
  })
})
