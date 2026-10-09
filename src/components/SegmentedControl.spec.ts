import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SegmentedControl from './SegmentedControl.vue'

describe('SegmentedControl', () => {
  const options = [30, 60, 120, 240]

  it('renders a segment for every option', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, label: 'Travel time', testid: 'duration-slider' } })
    for (const option of options) {
      expect(wrapper.find(`input[data-testid="duration-slider-option-${option}"]`).exists()).toBe(true)
    }
  })

  it('renders a label for every option, formatted with formatOption', () => {
    const wrapper = mount(SegmentedControl, {
      props: { modelValue: 60, options, label: 'Travel time', testid: 'duration-slider', formatOption: (v: string | number) => `${v} min` },
    })
    for (const option of options) {
      expect(wrapper.find(`[data-testid="duration-slider-option-${option}"]`).element.parentElement?.textContent?.trim()).toBe(`${option} min`)
    }
  })

  it('falls back to the plain number when formatOption is not provided', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, label: 'Travel time', testid: 'duration-slider' } })
    expect(wrapper.find('input[data-testid="duration-slider-option-60"]').element.parentElement?.textContent?.trim()).toBe('60')
  })

  it('checks the radio input matching modelValue', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 120, options, label: 'Travel time', testid: 'duration-slider' } })
    expect((wrapper.find('input[data-testid="duration-slider-option-120"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('input[data-testid="duration-slider-option-60"]').element as HTMLInputElement).checked).toBe(false)
  })

  it('marks the option matching modelValue as selected', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 120, options, label: 'Travel time', testid: 'duration-slider' } })
    expect(wrapper.find('input[data-testid="duration-slider-option-120"]').element.parentElement?.className).toContain('bg-coral')
    expect(wrapper.find('input[data-testid="duration-slider-option-60"]').element.parentElement?.className).not.toContain('bg-coral')
  })

  it('emits update:modelValue with the selected option when a segment is chosen', async () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, label: 'Travel time', testid: 'duration-slider' } })
    await wrapper.find('input[data-testid="duration-slider-option-240"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([240])
  })

  it('takes string options too, and emits the chosen string', async () => {
    const wrapper = mount(SegmentedControl, {
      props: { modelValue: 'kmh', options: ['kmh', 'mph'], label: 'Speed unit', testid: 'speed-unit' },
    })
    expect((wrapper.find('input[data-testid="speed-unit-option-kmh"]').element as HTMLInputElement).checked).toBe(true)
    await wrapper.find('input[data-testid="speed-unit-option-mph"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['mph'])
  })

  it('groups the options under a single radio input name', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, label: 'Travel time', testid: 'duration-slider', name: 'duration' } })
    for (const option of options) {
      expect(wrapper.find(`input[data-testid="duration-slider-option-${option}"]`).attributes('name')).toBe('duration')
    }
  })

  it('is a radio group named by its label', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, label: 'Travel time', testid: 'duration-slider' } })
    const group = wrapper.get('[data-testid="duration-slider"]')
    expect(group.attributes('role')).toBe('radiogroup')
    expect(group.attributes('aria-label')).toBe('Travel time')
  })

  it('rings the visible segment when its hidden radio has keyboard focus', () => {
    const wrapper = mount(SegmentedControl, { props: { modelValue: 60, options, label: 'Travel time', testid: 'duration-slider' } })
    const segment = wrapper.get('input[data-testid="duration-slider-option-30"]').element.parentElement
    expect(segment?.className).toContain('has-focus-visible:outline-focus')
  })
})
