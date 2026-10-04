// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { redactPath, redactUrl } from './redact'

describe('redactPath', () => {
  it('drops the token from a set-password link', () => {
    expect(redactPath('/welcome/abc123')).toBe('/welcome')
  })

  it('drops the token from a mangled link that lands on the not-found page', () => {
    expect(redactPath('/welcome/abc123/extra')).toBe('/welcome')
  })

  it('leaves every other path as it is', () => {
    expect(redactPath('/scenario/ca-hsr')).toBe('/scenario/ca-hsr')
    expect(redactPath('/welcome')).toBe('/welcome')
    expect(redactPath('/welcomes/abc')).toBe('/welcomes/abc')
  })
})

describe('redactUrl', () => {
  it('drops the token from a set-password link', () => {
    expect(redactUrl('https://sparks.example/welcome/abc123')).toBe('https://sparks.example/welcome')
  })

  it('drops a token query parameter, as on the link the API issues', () => {
    expect(redactUrl('https://sparks.example/set-password?token=abc123')).toBe('https://sparks.example/set-password')
  })

  it('leaves other query parameters alone', () => {
    expect(redactUrl('https://sparks.example/scenario/ca-hsr?origin=1')).toBe('https://sparks.example/scenario/ca-hsr?origin=1')
  })

  it('returns an unparseable URL unchanged', () => {
    expect(redactUrl('not a url')).toBe('not a url')
  })
})
