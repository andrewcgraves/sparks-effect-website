// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { scrubItem } from './scrub'

const SESSION_TOKEN = 'b64-session-token-0123456789abcdef'

// The shape Faro hands beforeSend: a payload and the page/session meta.
function exceptionItem(value: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'exception',
    payload: {
      type: 'Error',
      value,
      stacktrace: { frames: [{ filename: 'https://sparks-effect.app/assets/index-abc.js', function: 'submit' }] },
      context: { trace_id: 'trace-1', ...extra },
    },
    meta: { page: { url: 'https://sparks-effect.app/scenario/ca-hsr' } },
  }
}

function serialised(item: unknown): string {
  return JSON.stringify(item)
}

describe('scrubItem', () => {
  it('redacts a bearer token wherever it appears', () => {
    const item = scrubItem(exceptionItem('GET /api/auth/me sent Authorization: Bearer abc.def-123'), [])
    expect(serialised(item)).not.toContain('abc.def-123')
    expect(item.payload.value).toContain('Bearer [redacted]')
  })

  it('redacts the stored session token even without a Bearer prefix', () => {
    const item = scrubItem(exceptionItem(`could not parse ${SESSION_TOKEN}`, { note: `token was ${SESSION_TOKEN}` }), [SESSION_TOKEN])
    expect(serialised(item)).not.toContain(SESSION_TOKEN)
  })

  it('redacts any field named like a password, token or authorization header', () => {
    const item = scrubItem(exceptionItem('boom', { password: 'hunter2', Authorization: 'Basic xyz', sessionToken: 'zzz' }), [])
    const text = serialised(item)
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('Basic xyz')
    expect(text).not.toContain('zzz')
  })

  it('drops the one-time token from a set-password link in the page URL', () => {
    const item = exceptionItem('boom')
    item.meta.page.url = 'https://sparks-effect.app/welcome/one-time-abc'
    expect(serialised(scrubItem(item, []))).not.toContain('one-time-abc')

    const issued = exceptionItem('fetch https://sparks-effect.app/set-password?token=one-time-xyz&x=1 failed')
    expect(serialised(scrubItem(issued, []))).not.toContain('one-time-xyz')
  })

  it('leaves what makes the report useful alone', () => {
    const item = scrubItem(exceptionItem('Cannot read properties of undefined'), [SESSION_TOKEN])
    expect(item.payload.value).toBe('Cannot read properties of undefined')
    expect(item.payload.context.trace_id).toBe('trace-1')
    expect(item.payload.stacktrace.frames[0].function).toBe('submit')
    expect(item.meta.page.url).toBe('https://sparks-effect.app/scenario/ca-hsr')
  })

  it('ignores an empty secret rather than redacting every gap between characters', () => {
    expect(scrubItem(exceptionItem('boom'), ['']).payload.value).toBe('boom')
  })
})
