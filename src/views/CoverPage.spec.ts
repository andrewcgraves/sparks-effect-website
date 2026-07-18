import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CoverPage from './CoverPage.vue'

describe('CoverPage', () => {
  it('renders static placeholder content', () => {
    const wrapper = mount(CoverPage)
    expect(wrapper.get('h1').text()).toBe('Hello')
  })
})
