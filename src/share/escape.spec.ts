import { describe, expect, it } from 'vitest'
import { escapeMarkup } from './escape'

describe('escapeMarkup', () => {
  it('escapes all five characters markup gives meaning to, ampersand first', () => {
    expect(escapeMarkup(`a&b<c>"d'e &amp;`)).toBe('a&amp;b&lt;c&gt;&quot;d&#39;e &amp;amp;')
  })
})
