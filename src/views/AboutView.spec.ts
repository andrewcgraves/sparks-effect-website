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
  it('is a dated page that says who builds and maintains Sparks Effect', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('h1').text()).toBe('About')
    expect(wrapper.get('[data-testid="page-updated"] time').attributes('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const text = wrapper.text()
    expect(text).toContain('Built and maintained by volunteers at Californians for Electric Rail.')
  })

  it('reads as one run of paragraphs: the name, the site, who builds it, CER in their own words, then their links', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('h2, blockquote')).toHaveLength(0)
    const paragraphs = wrapper.findAll('p').map((p) => p.text().replace(/\s+/g, ' '))
    const first = paragraphs.findIndex((p) => p.startsWith('The “sparks effect”'))
    expect(paragraphs.slice(first)).toEqual([
      'The “sparks effect” is a term from British railway planning for the rise in passenger numbers '
      + 'that often follows the electrification of a line, beyond what faster journeys, more frequent '
      + 'services and better reliability alone would predict.',
      'This site exists to help advocates organize around lines that would benefit their community. '
      + 'It gives them one place to share those lines, and to show politicians the case for change.',
      'Built and maintained by volunteers at Californians for Electric Rail.',
      'Californians for Electric Rail is a volunteer organization with members around the state, '
      + 'dedicated to connecting transit advocates and railfans with environmentalists, unions, good '
      + 'government advocates, and other supporters of environmentally-friendly, union-made, '
      + 'cost-effective rail.',
      'We are committed to removing barriers to electrification via overhead catenary of California\'s '
      + 'railways through state legislative advocacy and engagement in decision-making within local '
      + 'transit agencies and regulatory boards.',
      'If you’d like to get more involved, follow these links:',
    ])
    const invitation = wrapper.findAll('p').at(-1)?.element
    expect(invitation?.nextElementSibling).toBe(wrapper.get('[data-testid="cer-links"]').element)
  })

  it('links Californians for Electric Rail\'s website and Bluesky, each in a new tab', async () => {
    const list = (await mountView()).get('[data-testid="cer-links"]')
    const links = list.findAll('a')
    expect(links.map((a) => a.attributes('href'))).toEqual([
      'https://calelectricrail.org',
      'https://bsky.app/profile/calelectricrail.org',
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
