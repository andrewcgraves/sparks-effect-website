import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readJson, removeKey, writeJson } from './storage'

const KEY = 'sparks-effect.test'

describe('storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('readJson', () => {
    it('round-trips an object written by writeJson', () => {
      writeJson(KEY, { token: 'tok-1', count: 2 })
      expect(readJson(KEY)).toEqual({ token: 'tok-1', count: 2 })
    })

    it('returns null when nothing is stored', () => {
      expect(readJson(KEY)).toBeNull()
    })

    it('returns null for data that is not valid JSON', () => {
      window.localStorage.setItem(KEY, '{ not json')
      expect(readJson(KEY)).toBeNull()
    })

    it('returns null for JSON that is not an object', () => {
      // A caller destructuring fields off a string or array would get nonsense.
      for (const raw of ['"a string"', '42', 'null', '[1, 2]']) {
        window.localStorage.setItem(KEY, raw)
        expect(readJson(KEY)).toBeNull()
      }
    })

    it('returns null when storage cannot be read', () => {
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      expect(readJson(KEY)).toBeNull()
    })
  })

  describe('writeJson', () => {
    it('swallows a rejected write rather than throwing at the caller', () => {
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      expect(() => writeJson(KEY, { token: 'tok-1' })).not.toThrow()
    })
  })

  describe('removeKey', () => {
    it('deletes the entry', () => {
      writeJson(KEY, { token: 'tok-1' })
      removeKey(KEY)
      expect(readJson(KEY)).toBeNull()
    })

    it('swallows a rejected removal', () => {
      vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      expect(() => removeKey(KEY)).not.toThrow()
    })
  })
})
