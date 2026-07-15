import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'

describe('index.html link preview meta', () => {
  it('sets a meta description', () => {
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]+"/)
  })

  it('sets Open Graph title and description', () => {
    expect(html).toMatch(/<meta\s+property="og:title"\s+content="[^"]+"/)
    expect(html).toMatch(/<meta\s+property="og:description"\s+content="[^"]+"/)
  })

  it('sets the Open Graph type and site name', () => {
    expect(html).toMatch(/<meta\s+property="og:type"\s+content="website"/)
    expect(html).toMatch(/<meta\s+property="og:site_name"\s+content="Sparks Effect"/)
  })

  it('sets a Twitter card with title and description', () => {
    expect(html).toMatch(/<meta\s+name="twitter:card"\s+content="summary"/)
    expect(html).toMatch(/<meta\s+name="twitter:title"\s+content="[^"]+"/)
    expect(html).toMatch(/<meta\s+name="twitter:description"\s+content="[^"]+"/)
  })
})
