import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import TermsView from './TermsView.vue'
import { CONTACT_EMAIL } from '../legal/contact'
import { seriousA11yViolations } from '../test/axe'

const Blank = { template: '<div />' }

async function mountView(routes: RouteRecordRaw[] = [], attachTo?: Element) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Blank }, { path: '/terms', component: TermsView }, ...routes],
  })
  await router.push('/terms')
  await router.isReady()
  return mount(TermsView, { global: { plugins: [router] }, attachTo })
}

describe('TermsView', () => {
  it('is dated terms of use', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('h1').text()).toBe('Terms of use')
    expect(wrapper.get('[data-testid="page-updated"] time').attributes('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('covers accounts, published content, acceptable use, takedown, the model, data licences and changes', async () => {
    expect((await mountView()).findAll('h2').map((h) => h.text())).toEqual([
      'What Sparks Effect is',
      'Accounts',
      'Content you publish',
      'Acceptable use',
      'Moderation and takedown',
      'No warranty on modelled results',
      'Data licences',
      'Changes to these terms',
    ])
  })

  it('forbids passing a hypothetical line off as a real or official plan', async () => {
    const rules = (await mountView()).get('[data-testid="acceptable-use"]').findAll('li').map((li) => li.text())
    expect(rules.some((rule) => /official plan/.test(rule))).toBe(true)
    expect(rules.some((rule) => /unlawful/.test(rule))).toBe(true)
    expect(rules.some((rule) => /personal information/.test(rule))).toBe(true)
  })

  it('says we may unpublish, and gives the address to report a page to', async () => {
    const wrapper = await mountView()
    const takedown = wrapper.get('#takedown')
    expect(takedown.text()).toBe('Moderation and takedown')
    expect(wrapper.text()).toMatch(/unpublish or remove/)
    const report = wrapper.get(`[data-testid="report-by-email"] a[href="mailto:${CONTACT_EMAIL}"]`)
    expect(report.text()).toBe(CONTACT_EMAIL)
  })

  it('offers the Report a problem page only once it exists', async () => {
    expect((await mountView()).find('[data-testid="report-link"]').exists()).toBe(false)
    const link = (await mountView([{ path: '/report', component: Blank }])).get('[data-testid="report-link"]')
    expect(link.attributes('href')).toBe('/report')
  })

  it('disclaims the model, pointing at How it works only once that page exists', async () => {
    const without = await mountView()
    expect(without.text()).toMatch(/A splash zone is an estimate/)
    expect(without.text()).toMatch(/no warranty of any kind/)
    expect(without.find('[data-testid="how-it-works-link"]').exists()).toBe(false)

    const link = (await mountView([{ path: '/how-it-works', component: Blank }])).get('[data-testid="how-it-works-link"]')
    expect(link.attributes('href')).toBe('/how-it-works')
  })

  it('keeps the author\'s ownership and takes a licence to show what they publish', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/You keep ownership/)
    expect(text).toMatch(/non-exclusive, worldwide, royalty-free licence/)
  })

  it('points data licence questions at the attribution page', async () => {
    expect((await mountView()).get('[data-testid="terms-attribution"]').attributes('href')).toBe('/attribution')
  })

  it('uses the product words, not the domain ones', async () => {
    const visible = (await mountView()).text()
    for (const word of ['scenarios?', 'services?', 'isochrones?', 'alignments?'].map(
      (w) => new RegExp(`(?<![\\w-])${w}(?![\\w-])`, 'i'),
    )) {
      expect(visible).not.toMatch(word)
    }
  })

  it('has no serious or critical accessibility violations', async () => {
    const wrapper = await mountView([], document.body)
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })
})
