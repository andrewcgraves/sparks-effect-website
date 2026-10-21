import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PageHeader from './PageHeader.vue'
import { seriousA11yViolations } from '../test/axe'

describe('PageHeader', () => {
  it('renders a title alone as the page heading, in the display role', () => {
    const header = mount(PageHeader, { props: { title: 'Admin' } })
    const heading = header.get('hgroup > h1')
    expect(heading.text()).toBe('Admin')
    expect(heading.classes()).toEqual(['t-display', 'text-ink-true'])
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(header.findAll('p')).toHaveLength(0)
  })

  it('puts the subtitle then the slug under the title, both in the meta role', () => {
    const header = mount(PageHeader, {
      props: { title: 'CA HSR', subtitle: 'Electrified · High-speed rail', slug: 'ca-hsr', subtitleTestid: 'service-subtext' },
    })
    const lines = header.findAll('hgroup > p')
    expect(lines.map((line) => line.text())).toEqual(['Electrified · High-speed rail', 'ca-hsr'])
    for (const line of lines) expect(line.classes()).toEqual(['t-meta', 'text-ink-muted'])
    expect(header.get('[data-testid="service-subtext"]').text()).toBe('Electrified · High-speed rail')
  })

  it('leaves out an empty subtitle', () => {
    const header = mount(PageHeader, { props: { title: 'CA HSR', subtitle: '' } })
    expect(header.find('hgroup > p').exists()).toBe(false)
  })

  it('takes a subtitle with markup from its slot', () => {
    const header = mount(PageHeader, {
      props: { title: 'Terms of use', subtitleTestid: 'page-updated' },
      slots: { subtitle: 'Last updated <time datetime="2026-10-09">October 9, 2026</time>' },
    })
    expect(header.get('[data-testid="page-updated"] time').attributes('datetime')).toBe('2026-10-09')
  })

  it('sets the actions beside the title block, not inside it', () => {
    const header = mount(PageHeader, {
      props: { title: 'CA HSR' },
      slots: { actions: '<a href="/edit" data-testid="edit">Edit</a>' },
    })
    expect(header.find('hgroup [data-testid="edit"]').exists()).toBe(false)
    expect(header.get('hgroup + div [data-testid="edit"]').text()).toBe('Edit')
  })

  it('has no actions row when there are no actions', () => {
    const header = mount(PageHeader, { props: { title: 'CA HSR' } })
    expect(header.find('hgroup + div').exists()).toBe(false)
  })

  it('moves focus to the heading when asked', () => {
    const header = mount(PageHeader, { props: { title: 'CA HSR' }, attachTo: document.body })
    header.vm.focus()
    expect(document.activeElement).toBe(header.get('h1').element)
    header.unmount()
  })

  it('has no serious or critical accessibility violations', async () => {
    const header = mount(PageHeader, {
      props: { title: 'CA HSR', subtitle: 'Electrified', slug: 'ca-hsr' },
      slots: { actions: '<a href="/edit">Edit</a>' },
      attachTo: document.body,
    })
    expect(await seriousA11yViolations(header)).toEqual([])
    header.unmount()
  })
})
