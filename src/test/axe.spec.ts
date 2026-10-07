import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { seriousA11yViolations } from './axe'

describe('seriousA11yViolations', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reports a button with no accessible name', async () => {
    const wrapper = mount({ template: '<main><button type="button">✕</button><button type="button"></button></main>' }, { attachTo: document.body })
    const violations = await seriousA11yViolations(wrapper)
    expect(violations.map((v) => v.rule)).toContain('button-name')
  })

  it('reports a control named only by a glyph, which axe accepts but a screen reader reads as "multiplication sign"', async () => {
    const wrapper = mount({
      template: `<main>
        <button type="button">✕</button>
        <a href="/up">↑</a>
        <button type="button"><span aria-hidden="true">⋯</span></button>
        <button type="button" aria-label="Remove stop">✕</button>
        <button type="button"><span aria-hidden="true">📍</span> Pick location</button>
      </main>`,
    }, { attachTo: document.body })
    const glyphs = (await seriousA11yViolations(wrapper)).find((v) => v.rule === 'glyph-name')
    expect(glyphs?.targets).toEqual(['<button type="button">✕</button>', '<a href="/up">↑</a>'])
  })

  it('passes a labelled button', async () => {
    const wrapper = mount({ template: '<main><button type="button" aria-label="Remove stop">✕</button></main>' }, { attachTo: document.body })
    expect(await seriousA11yViolations(wrapper)).toEqual([])
  })

  it('refuses a detached tree, which axe cannot see', async () => {
    const wrapper = mount({ template: '<main />' })
    await expect(seriousA11yViolations(wrapper)).rejects.toThrow(/attachTo/)
  })
})
