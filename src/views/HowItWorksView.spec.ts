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
    expect(diagram.get(`desc#${descId}`).text()).toMatch(/access leg.*line.*egress leg/s)
  })

  it('names the three states the map draws a line in', async () => {
    const legend = (await mountView()).get('[data-testid="line-state-legend"]')
    expect(legend.findAll('li').map((li) => li.get('strong').text())).toEqual([
      'Ridden',
      'Unridden',
      'Unfinished',
    ])
  })

  it('states the weekday-morning departure and the door-to-door minutes', async () => {
    const text = (await mountView()).text()
    expect(text).toContain('8 a.m. Pacific time on a weekday')
    expect(text).toContain('door to door')
    expect(text).toContain('waiting for a local bus or train')
  })

  it('uses the product words, not the domain ones', async () => {
    const text = (await mountView()).text().toLowerCase()
    for (const word of ['scenario', 'service', 'isochrone', 'costing', 'alignment', 'track']) {
      expect(text).not.toContain(word)
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
