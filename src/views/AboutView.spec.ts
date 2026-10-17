import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AboutView from './AboutView.vue'
import { seriousA11yViolations } from '../test/axe'

const Blank = { template: '<div />' }

async function mountView(attachTo?: Element) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Blank }, { path: '/about', component: AboutView }],
  })
  await router.push('/about')
  await router.isReady()
  return mount(AboutView, { global: { plugins: [router] }, attachTo })
}

describe('AboutView', () => {
  it('says who builds Sparks Effect, who keeps it running, and that it takes no donations', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('h1').text()).toBe('About')
    expect(wrapper.get('[data-testid="page-updated"] time').attributes('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const text = wrapper.text()
    expect(text).toContain('Built with love by Californians for Electric Rail')
    expect(text).toContain('maintained by volunteers')
    expect(text).toContain("We don't take donations")
    expect(text).toContain('SFA')
    expect(text).toContain('RailPAC')
  })

  it('links every Californians for Electric Rail account, each in a new tab and without tracking', async () => {
    const list = (await mountView()).get('[data-testid="cer-links"]')
    const links = list.findAll('a')
    expect(links.map((a) => a.attributes('href'))).toEqual([
      'https://calelectricrail.org',
      'https://calelectricrail.org/contact/',
      'https://bsky.app/profile/calelectricrail.org',
      'https://twitter.com/calelectricrail',
    ])
    for (const link of links) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
    }
  })

  it('has no serious or critical accessibility violations', async () => {
    const wrapper = await mountView(document.body)
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })
})
