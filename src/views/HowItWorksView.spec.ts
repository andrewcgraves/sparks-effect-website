import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import HowItWorksView from './HowItWorksView.vue'

const Blank = { template: '<div />' }

async function mountView(routes: RouteRecordRaw[] = []) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/how-it-works', component: HowItWorksView }, ...routes],
  })
  await router.push('/how-it-works')
  await router.isReady()
  return mount(HowItWorksView, { global: { plugins: [router] } })
}

describe('HowItWorksView', () => {
  it('walks through the claim a splash zone makes, one section at a time', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('h1').text()).toBe('How it works')
    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual([
      'What you\'re looking at',
      'What time of day',
      'What the minutes include',
      'Where the numbers come from',
      'What it doesn\'t model',
    ])
  })

  it('gives the diagram an accessible name and description', async () => {
    const diagram = (await mountView()).get('[data-testid="how-it-works-diagram"]')
    expect(diagram.attributes('role')).toBe('img')
    const [titleId, descId] = diagram.attributes('aria-labelledby')!.split(' ')
    expect(diagram.get(`title#${titleId}`).text()).toBe('One trip through a splash zone')
    const desc = diagram.get(`desc#${descId}`).text()
    expect(desc).toMatch(/station.*ride the line.*head\s+out/s)
    // The same names the map's key gives the two areas.
    expect(desc).toContain('Origin reach')
    expect(desc).toContain('From station')
  })

  it('labels the diagram in the words the prose and the map key use', async () => {
    const labels = (await mountView()).findAll('[data-testid="how-it-works-diagram"] text').map((t) => t.text())
    expect(labels).toEqual(expect.arrayContaining(['Start', 'Origin reach', 'From station', 'the line', 'Head out']))
  })

  it('links back to the list of lines', async () => {
    expect((await mountView()).get('[data-testid="back-to-lines"]').attributes('href')).toBe('/')
  })

  it('names the three states the map draws a line in', async () => {
    const legend = (await mountView()).get('[data-testid="line-state-legend"]')
    expect(legend.findAll('li').map((li) => li.get('strong').text())).toEqual([
      'Ridden',
      'Unridden',
      'Unfinished',
    ])
  })

  it('states the clock Transit runs to, and that the other modes ignore it', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/Transit trip leaves .* 8 a\.m\. Pacific time on a weekday/)
    expect(text).toMatch(/Walk, Bike and Drive .* whatever the hour/)
    expect(text).toMatch(/Traffic\./)
  })

  it('counts door-to-door minutes, with the wait for local transit', async () => {
    const text = (await mountView()).text()
    expect(text).toContain('door to door')
    expect(text).toMatch(/waiting for a local bus\s+or train/)
    expect(text).toMatch(/by the same mode/)
  })

  it('does not claim every line\'s times are worked out from its vehicles', async () => {
    expect((await mountView()).text()).toMatch(/Curated networks .* published plans/s)
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

  it('credits OpenStreetMap for the street and path network', async () => {
    const osm = (await mountView()).get('a[href="https://www.openstreetmap.org/copyright"]')
    expect(osm.text()).toBe('OpenStreetMap')
  })

  it('points at the attribution page once that page exists', async () => {
    expect((await mountView()).find('[data-testid="how-it-works-attribution"]').exists()).toBe(false)

    const credits = (await mountView([{ path: '/attribution', component: Blank }]))
      .get('[data-testid="how-it-works-attribution"] a')
    expect(credits.attributes('href')).toBe('/attribution')
    expect(credits.text()).toBe('Attribution')
  })
})
