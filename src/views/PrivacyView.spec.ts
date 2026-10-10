import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import PrivacyView from './PrivacyView.vue'
import { CONTACT_EMAIL } from '../legal/contact'
import { seriousA11yViolations } from '../test/axe'

const Blank = { template: '<div />' }

async function mountView(attachTo?: Element) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Blank }, { path: '/privacy', component: PrivacyView }],
  })
  await router.push('/privacy')
  await router.isReady()
  return mount(PrivacyView, { global: { plugins: [router] }, attachTo })
}

describe('PrivacyView', () => {
  it('is a dated privacy policy', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('h1').text()).toBe('Privacy policy')
    expect(wrapper.get('[data-testid="page-updated"] time').attributes('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('walks through what is collected, who handles it, how long, and how to ask', async () => {
    expect((await mountView()).findAll('h2').map((h) => h.text())).toEqual([
      'What we collect, and why',
      'Cookies and local storage',
      'Who handles it on our behalf',
      'How long we keep it',
      'Your choices',
      'Changes to this policy',
    ])
  })

  it('names every third party that receives data', async () => {
    const processors = (await mountView()).get('[data-testid="processors"]')
    const names = processors.findAll('li').map((li) => li.get('strong').text())
    expect(names).toEqual(['Vercel', 'Railway', 'Stadia Maps', 'OpenFreeMap', 'Grafana Cloud'])
  })

  it('says what the address box and "use my location" send, and to whom', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/type into the address box.*Stadia Maps/s)
    expect(text).toMatch(/use my location.*asks your permission/s)
  })

  it('says there are no cookies, and what local storage holds instead', async () => {
    const text = (await mountView()).text()
    expect(text).toContain('sets no cookies')
    expect(text).toMatch(/local storage.*session token/s)
    expect(text).toMatch(/local storage.*drafts/s)
  })

  it('says what an account stores and when a session ends', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/email address.*display name.*hash of your password/s)
    expect(text).toContain('24 hours')
  })

  it('describes the error reports and what is scrubbed from them', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/Grafana Cloud/)
    expect(text).toMatch(/scrubbed of sign-in tokens/)
    // Faro keeps the page URL, query and all (scrub.spec.ts), and sends from
    // every deployed build, so the copy must not claim less.
    expect(text).toMatch(/address of the page it happened on, which includes a plotted starting point/)
    expect(text).toMatch(/the live site and its previews/)
  })

  it('does not claim the typed address search leaves the browser, which the sink keeps', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/how many matches came back but never what you typed/)
    expect(text).toMatch(/travel mode was switched/)
  })

  it('gives one address for deletion requests', async () => {
    const links = (await mountView()).findAll(`a[href="mailto:${CONTACT_EMAIL}"]`)
    expect(links.length).toBeGreaterThan(0)
    expect(links[0].text()).toBe(CONTACT_EMAIL)
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
    const wrapper = await mountView(document.body)
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })
})
