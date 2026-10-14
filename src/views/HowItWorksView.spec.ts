import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { seriousA11yViolations } from '../test/axe'
import HowItWorksView from './HowItWorksView.vue'

const Blank = { template: '<div />' }

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/how-it-works', component: HowItWorksView },
      { path: '/attribution', component: Blank },
    ],
  })
  await router.push('/how-it-works')
  await router.isReady()
  mounted = mount(HowItWorksView, { global: { plugins: [router] }, attachTo: document.body })
  return mounted
}

describe('HowItWorksView', () => {
  it('teaches the map first, then gives the fine print', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('h1').text()).toBe('How it works')
    expect(wrapper.find('[data-testid="page-updated"] time').exists()).toBe(true)
    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual([
      'How to read the map',
      'The fine print',
    ])
    expect(wrapper.find('[data-testid="sample-map"]').exists()).toBe(true)
  })

  it('links back to the list of lines', async () => {
    expect((await mountView()).get('[data-testid="back-to-lines"]').attributes('href')).toBe('/')
  })

  it('states the clock Transit runs to, and that the other modes ignore it', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/Transit trips leave at 8 a\.m\. Pacific time on a weekday/)
    expect(text).toMatch(/Public holidays count as weekdays/)
    expect(text).toMatch(/Walk, Bike and Drive .* whatever the hour/)
    expect(text).toMatch(/free-flowing roads/)
  })

  it('counts door-to-door minutes, with the wait for local transit', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/from leaving the start/)
    expect(text).toMatch(/waits for local buses\s+and trains/)
    expect(text).toMatch(/by the same mode/)
  })

  it('adds no wait to board the line unless one is set, and then only once', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/no wait to board/)
    expect(text).toMatch(/once, when you first board/)
  })

  it('does not claim every line\'s times are worked out from its vehicles', async () => {
    expect((await mountView()).text()).toMatch(/Curated networks .* published plans/s)
  })

  it('says where the streets and timetables come from, and how stale they can be', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/California and Nevada/)
    expect(text).toMatch(/few weeks old/)
  })

  it('names what it leaves out', async () => {
    const text = (await mountView()).text()
    for (const left of [/Fares/, /crowding/, /traffic/, /delays/]) expect(text).toMatch(left)
  })

  it('uses the product words, not the domain ones', async () => {
    const wrapper = await mountView()
    const visible = [
      wrapper.text(),
      wrapper.get('desc').text(),
    ].join(' ')
    // Whole words only: "self-service" or "racetrack" is not the domain word.
    for (const word of [
      'scenarios?',
      'services?',
      'isochrones?',
      'costing',
      'alignments?',
      'tracks?',
      'access legs?',
      'egress legs?',
    ].map((w) => new RegExp(`(?<![\\w-])${w}(?![\\w-])`, 'i'))) {
      expect(visible).not.toMatch(word)
    }
  })

  it('leaves the credits to the attribution page', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('a[href="https://www.openstreetmap.org/copyright"]').exists()).toBe(false)
    const credits = wrapper.get('[data-testid="how-it-works-attribution"] a')
    expect(credits.attributes('href')).toBe('/attribution')
    expect(credits.text()).toBe('Attribution')
  })

  it('has no serious accessibility violations', async () => {
    expect(await seriousA11yViolations(await mountView())).toEqual([])
  })
})
