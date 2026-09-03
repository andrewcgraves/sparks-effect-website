// @vitest-environment node
// No DOM in this file. See the environment note in vite.config.ts.

import { describe, expect, it } from 'vitest'
import { TRACE_HEADER, newTraceId, traceHeaders } from './traceId'

describe('newTraceId', () => {
  it('returns a UUID', () => {
    expect(newTraceId()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns a different id on each call', () => {
    expect(newTraceId()).not.toBe(newTraceId())
  })
})

describe('traceHeaders', () => {
  it('puts the id on X-Trace-Id', () => {
    expect(traceHeaders('abc-123')).toEqual({ [TRACE_HEADER]: 'abc-123' })
  })
})
