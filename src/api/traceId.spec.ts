import { describe, expect, it } from 'vitest'
import { newTraceId } from './traceId'

describe('newTraceId', () => {
  it('returns a UUID', () => {
    expect(newTraceId()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns a different id on each call', () => {
    expect(newTraceId()).not.toBe(newTraceId())
  })
})
