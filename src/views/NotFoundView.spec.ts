import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NotFoundView from './NotFoundView.vue'

describe('NotFoundView', () => {
  it('renders a static not-found message', () => {
    const wrapper = mount(NotFoundView)
    expect(wrapper.get('h1').text()).toBe('Page not found')
  })
})
