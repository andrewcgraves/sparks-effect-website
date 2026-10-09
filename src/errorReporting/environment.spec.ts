// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { environmentFor } from './environment'

describe('environmentFor', () => {
  it('is production on the production domain, with or without www', () => {
    expect(environmentFor('sparks-effect.app')).toBe('production')
    expect(environmentFor('www.sparks-effect.app')).toBe('production')
    expect(environmentFor('WWW.Sparks-Effect.app')).toBe('production')
  })

  // Staging and production serve the very same build (docs/releases.md), so
  // nothing baked in at build time can tell them apart.
  it('is staging anywhere else the same build is served', () => {
    expect(environmentFor('staging.sparks-effect.app')).toBe('staging')
    expect(environmentFor('sparks-effect-website.vercel.app')).toBe('staging')
    expect(environmentFor('sparks-effect.app.evil.example')).toBe('staging')
  })
})
