// @vitest-environment node

import { describe, it, expect } from 'vitest'
import { shortCommitSha } from './buildVersion'

describe('shortCommitSha', () => {
  it('shortens a full commit SHA to seven characters', () => {
    expect(shortCommitSha('c054ba5e1f2a3b4c5d6e7f8091a2b3c4d5e6f708')).toBe('c054ba5')
  })

  it('falls back to dev when there is no commit SHA', () => {
    expect(shortCommitSha(undefined)).toBe('dev')
    expect(shortCommitSha('')).toBe('dev')
    expect(shortCommitSha('  ')).toBe('dev')
  })
})
