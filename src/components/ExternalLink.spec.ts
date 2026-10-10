import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ExternalLink from './ExternalLink.vue'

describe('ExternalLink', () => {
  it('opens another site in a new tab without handing it the opener', () => {
    const link = mount(ExternalLink, { props: { href: 'https://openfreemap.org' }, slots: { default: 'OpenFreeMap' } }).get('a')
    expect(link.text()).toBe('OpenFreeMap')
    expect(link.attributes('href')).toBe('https://openfreemap.org')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })
})
