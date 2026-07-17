import { describe, it, expect } from 'vitest'
import { resolveMapStyleUrl } from './mapStyle'

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
