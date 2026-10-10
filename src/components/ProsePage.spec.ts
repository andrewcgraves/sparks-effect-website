import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ProsePage from './ProsePage.vue'
import { seriousA11yViolations } from '../test/axe'

const Blank = { template: '<div />' }

function mountPage(props: { title: string; updated: string }, attachTo?: Element) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Blank }] })
  return mount(ProsePage, {
    props,
    slots: { default: '<p data-testid="body">Some prose.</p>' },
    global: { plugins: [router] },
    attachTo,
  })
}

describe('ProsePage', () => {
  it('heads the page with its title and the prose under it', () => {
    const wrapper = mountPage({ title: 'Privacy policy', updated: '2026-10-09' })
    expect(wrapper.get('h1').text()).toBe('Privacy policy')
    expect(wrapper.get('article [data-testid="body"]').text()).toBe('Some prose.')
  })

  it('dates the text, machine-readably and in words', () => {
    const dated = mountPage({ title: 'Terms of use', updated: '2026-10-09' }).get('[data-testid="page-updated"]')
    expect(dated.text()).toBe('Last updated October 9, 2026')
    expect(dated.get('time').attributes('datetime')).toBe('2026-10-09')
  })

  it('refuses a date that is not a calendar day', () => {
    expect(() => mountPage({ title: 'Terms of use', updated: 'yesterday' })).toThrow(/YYYY-MM-DD/)
  })

  it('links back to the list of lines', () => {
    expect(mountPage({ title: 'Attribution', updated: '2026-10-09' }).get('[data-testid="back-to-lines"]').attributes('href')).toBe('/')
  })

  it('has no serious or critical accessibility violations', async () => {
    const wrapper = mountPage({ title: 'Attribution', updated: '2026-10-09' }, document.body)
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })
})
