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

  it('passes a labelled button', async () => {
    const wrapper = mount({ template: '<main><button type="button" aria-label="Remove stop">✕</button></main>' }, { attachTo: document.body })
    expect(await seriousA11yViolations(wrapper)).toEqual([])
  })

  it('refuses a detached tree, which axe cannot see', async () => {
    const wrapper = mount({ template: '<main />' })
    await expect(seriousA11yViolations(wrapper)).rejects.toThrow(/attachTo/)
  })
})
