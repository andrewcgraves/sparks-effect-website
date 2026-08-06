import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SteppedSlider from './SteppedSlider.vue'

describe('SteppedSlider', () => {
  const options = [30, 60, 120, 240]

  it('renders a range input spanning the option indices', () => {
    const wrapper = mount(SteppedSlider, { props: { modelValue: 60, options, testid: 'duration-slider' } })
    const input = wrapper.find('input[data-testid="duration-slider"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('type')).toBe('range')
    expect(input.attributes('min')).toBe('0')
    expect(input.attributes('max')).toBe('3')
    expect(input.attributes('step')).toBe('1')
  })

  it('sets the slider position to the index of modelValue among options', () => {
    const wrapper = mount(SteppedSlider, { props: { modelValue: 120, options, testid: 'duration-slider' } })
    expect((wrapper.find('input[data-testid="duration-slider"]').element as HTMLInputElement).value).toBe('2')
  })

  it('renders a label for every option, formatted with formatOption', () => {
    const wrapper = mount(SteppedSlider, {
      props: { modelValue: 60, options, testid: 'duration-slider', formatOption: (v: number) => `${v} min` },
    })
    for (const option of options) {
      expect(wrapper.find(`[data-testid="duration-slider-option-${option}"]`).text()).toBe(`${option} min`)
    }
  })

  it('falls back to the plain number when formatOption is not provided', () => {
    const wrapper = mount(SteppedSlider, { props: { modelValue: 60, options, testid: 'duration-slider' } })
    expect(wrapper.find('[data-testid="duration-slider-option-60"]').text()).toBe('60')
  })

  it('marks the option matching modelValue as selected', () => {
    const wrapper = mount(SteppedSlider, { props: { modelValue: 120, options, testid: 'duration-slider' } })
    expect(wrapper.find('[data-testid="duration-slider-option-120"]').classes()).toContain('text-coral')
    expect(wrapper.find('[data-testid="duration-slider-option-60"]').classes()).not.toContain('text-coral')
  })

  it('emits update:modelValue with the option at the new index when the slider moves', async () => {
    const wrapper = mount(SteppedSlider, { props: { modelValue: 60, options, testid: 'duration-slider' } })
    await wrapper.find('input[data-testid="duration-slider"]').setValue('3')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([240])
  })

  it('reports the formatted value via aria-valuetext for assistive tech', () => {
    const wrapper = mount(SteppedSlider, {
      props: { modelValue: 30, options, testid: 'duration-slider', formatOption: (v: number) => `${v} min` },
    })
    expect(wrapper.find('input[data-testid="duration-slider"]').attributes('aria-valuetext')).toBe('30 min')
  })
})
