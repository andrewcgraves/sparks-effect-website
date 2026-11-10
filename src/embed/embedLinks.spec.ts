import { describe, expect, it } from 'vitest'
import { embedSnippet, fullPageHref, isEmbedPath } from './embedLinks'

const SCENARIO = { kind: 'scenario', slug: 'ca-hsr' } as const
const SERVICE = { kind: 'services', slug: 'northbound-express' } as const
const PLOTTED = { at: '37.79549,-122.39374', mode: 'transit', mins: '180' }

describe('fullPageHref', () => {
  it('opens the full page asking the same question the embed shows', () => {
    expect(fullPageHref('https://sparks-effect.app', SCENARIO, { ...PLOTTED, controls: '1' }))
      .toBe('https://sparks-effect.app/scenario/ca-hsr?at=37.79549%2C-122.39374&mode=transit&mins=180')
    expect(fullPageHref('https://dev.sparks-effect.app', SERVICE, {}))
      .toBe('https://dev.sparks-effect.app/services/northbound-express')
  })
})

describe('embedSnippet', () => {
  it('frames the map alone, carrying the plot on screen', () => {
    expect(embedSnippet({ origin: 'https://sparks-effect.app', target: SCENARIO, name: 'California HSR', query: PLOTTED, controls: false }))
      .toBe(
        '<iframe src="https://sparks-effect.app/embed/scenario/ca-hsr?at=37.79549%2C-122.39374&amp;mode=transit&amp;mins=180"\n' +
        '  width="100%" height="480" loading="lazy" style="border:0"\n' +
        '  title="California HSR splash zone on Sparks Effect"></iframe>',
      )
  })

  it('frames the controls on request, and names no plot when none is drawn', () => {
    expect(embedSnippet({ origin: 'https://dev.sparks-effect.app', target: SERVICE, name: 'Northbound', query: {}, controls: true }))
      .toContain('src="https://dev.sparks-effect.app/embed/services/northbound-express?controls=1"')
  })

  // A link that named only an origin was plotted with the form's defaults; the
  // snippet says what the link said, rather than filling in a mode for it.
  it('passes on only what the page’s link says, never a mode it did not', () => {
    const snippet = embedSnippet({ origin: 'https://sparks-effect.app', target: SCENARIO, name: 'X', query: { at: '37.7,-122.4' }, controls: false })
    expect(snippet).toContain('src="https://sparks-effect.app/embed/scenario/ca-hsr?at=37.7%2C-122.4"')
  })

  it('leaves out a plot the link names without an origin', () => {
    const snippet = embedSnippet({ origin: 'https://sparks-effect.app', target: SCENARIO, name: 'X', query: { mode: 'transit', mins: '180' }, controls: false })
    expect(snippet).toContain('src="https://sparks-effect.app/embed/scenario/ca-hsr"')
  })

  it('keeps a name from breaking out of the title', () => {
    const snippet = embedSnippet({ origin: 'https://sparks-effect.app', target: SCENARIO, name: 'A "B" & <C>', query: {}, controls: false })
    expect(snippet).toContain('title="A &quot;B&quot; &amp; &lt;C&gt; splash zone on Sparks Effect"')
  })
})

describe('isEmbedPath', () => {
  it('knows an embed by its path, and nothing else as one', () => {
    expect(isEmbedPath('/embed/scenario/ca-hsr')).toBe(true)
    expect(isEmbedPath('/embed/services/x')).toBe(true)
    expect(isEmbedPath('/embedded')).toBe(false)
    expect(isEmbedPath('/scenario/ca-hsr')).toBe(false)
  })
})
