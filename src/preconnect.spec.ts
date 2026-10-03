// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { safeHttpOrigin } from './preconnect'

describe('safeHttpOrigin', () => {
  it('keeps the origin of an absolute http(s) base and drops the path', () => {
    expect(safeHttpOrigin('https://api.example.com/v1')).toBe('https://api.example.com')
    expect(safeHttpOrigin(' http://localhost:8080/api ')).toBe('http://localhost:8080')
    expect(safeHttpOrigin('http://[::1]:8080/api')).toBe('http://[::1]:8080')
  })

  it('rejects a missing, non-http, or attribute-breaking origin', () => {
    expect(safeHttpOrigin(undefined)).toBeNull()
    expect(safeHttpOrigin('   ')).toBeNull()
    expect(safeHttpOrigin('javascript:alert(1)')).toBeNull()
    expect(safeHttpOrigin('http://bad".example.com')).toBeNull()
    expect(safeHttpOrigin('not a url')).toBeNull()
  })
})
