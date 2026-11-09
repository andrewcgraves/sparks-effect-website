import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CallToActionLink from './CallToActionLink.vue'

describe('CallToActionLink', () => {
  it('renders the label as a link to the https address, opening in a new tab', () => {
    const wrapper = mount(CallToActionLink, {
      props: { label: 'Sign here', url: 'https://example.org/petition' },
    })
    const link = wrapper.get('a')
    expect(link.text()).toBe('Sign here')
    expect(link.attributes('href')).toBe('https://example.org/petition')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it.each([
    ['a plain http address', 'Sign here', 'http://example.org/petition'],
    ['a javascript address', 'Sign here', 'javascript:alert(1)'],
    ['a relative address', 'Sign here', '/petition'],
    ['no address', 'Sign here', ''],
    ['a blank label', '   ', 'https://example.org/petition'],
  ])('renders nothing for %s', (_, label, url) => {
    const wrapper = mount(CallToActionLink, { props: { label, url } })
    expect(wrapper.find('a').exists()).toBe(false)
  })
})
