import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SpeedGraph from './SpeedGraph.vue'

describe('SpeedGraph', () => {
  it('renders the speed graph placeholder panel', () => {
    const wrapper = mount(SpeedGraph)
    expect(wrapper.find('[data-testid="speed-graph"]').exists()).toBe(true)
  })

  it('titles the panel Speed / acceleration', () => {
    const wrapper = mount(SpeedGraph)
    expect(wrapper.get('h2').text()).toBe('Speed / acceleration')
  })

  it('notes the graph comes from the Speed / Acceleration Graph project', () => {
    const wrapper = mount(SpeedGraph)
    expect(wrapper.text()).toContain('Speed / Acceleration Graph project')
  })
})
