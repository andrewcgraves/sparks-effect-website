import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SegmentedControl from './SegmentedControl.vue'

describe('SegmentedControl', () => {
  const options = [30, 60, 120, 240]

  it('renders a segment for every option', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, testid: 'duration-slider' } })
    for (const option of options) {
      expect(wrapper.find(`input[data-testid="duration-slider-option-${option}"]`).exists()).toBe(true)
    }
  })

  it('renders a label for every option, formatted with formatOption', () => {
    const wrapper = mount(SegmentedControl, {
      props: { modelValue: 60, options, testid: 'duration-slider', formatOption: (v: number) => `${v} min` },
    })
    for (const option of options) {
      expect(wrapper.find(`[data-testid="duration-slider-option-${option}"]`).element.parentElement?.textContent?.trim()).toBe(`${option} min`)
    }
  })

  it('falls back to the plain number when formatOption is not provided', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, testid: 'duration-slider' } })
    expect(wrapper.find('input[data-testid="duration-slider-option-60"]').element.parentElement?.textContent?.trim()).toBe('60')
  })

  it('checks the radio input matching modelValue', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 120, options, testid: 'duration-slider' } })
    expect((wrapper.find('input[data-testid="duration-slider-option-120"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('input[data-testid="duration-slider-option-60"]').element as HTMLInputElement).checked).toBe(false)
  })

  it('marks the option matching modelValue as selected', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 120, options, testid: 'duration-slider' } })
    expect(wrapper.find('input[data-testid="duration-slider-option-120"]').element.parentElement?.className).toContain('bg-coral')
    expect(wrapper.find('input[data-testid="duration-slider-option-60"]').element.parentElement?.className).not.toContain('bg-coral')
  })

  it('emits update:modelValue with the selected option when a segment is chosen', async () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, testid: 'duration-slider' } })
    await wrapper.find('input[data-testid="duration-slider-option-240"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([240])
  })

  it('groups the options under a single radio input name', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, testid: 'duration-slider', name: 'duration' } })
    for (const option of options) {
      expect(wrapper.find(`input[data-testid="duration-slider-option-${option}"]`).attributes('name')).toBe('duration')
    }
  })
})
