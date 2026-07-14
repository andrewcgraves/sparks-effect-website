import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IsochroneForm from './IsochroneForm.vue'
import type { GeocodingSuggestion } from './api/geocoding'

vi.mock('./analytics/index', () => ({
  trackModeToggle: vi.fn(),
}))

import { trackModeToggle } from './analytics/index'

describe('IsochroneForm', () => {
  beforeEach(() => {
    vi.mocked(trackModeToggle).mockClear()
  })

  it('renders a latitude input', () => {
    const wrapper = mount(IsochroneForm)
    expect(wrapper.find('input[data-testid="lat"]').exists()).toBe(true)
  })

  it('renders a longitude input', () => {
    const wrapper = mount(IsochroneForm)
    expect(wrapper.find('input[data-testid="lng"]').exists()).toBe(true)
  })

  it('renders a duration input', () => {
    const wrapper = mount(IsochroneForm)
    expect(wrapper.find('input[data-testid="duration"]').exists()).toBe(true)
  })

  it('renders walk, bike, and drive mode radio buttons', () => {
    const wrapper = mount(IsochroneForm)
    expect(wrapper.find('input[data-testid="mode-walk"]').exists()).toBe(true)
    expect(wrapper.find('input[data-testid="mode-bike"]').exists()).toBe(true)
    expect(wrapper.find('input[data-testid="mode-drive"]').exists()).toBe(true)
  })

  it('defaults to walk mode', () => {
    const wrapper = mount(IsochroneForm)
    expect((wrapper.find('input[data-testid="mode-walk"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('input[data-testid="mode-bike"]').element as HTMLInputElement).checked).toBe(false)
    expect((wrapper.find('input[data-testid="mode-drive"]').element as HTMLInputElement).checked).toBe(false)
  })

  it('emits submit with lat, lng, duration, and mode as numbers and string', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="duration"]').setValue('30')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ lat: number; lng: number; duration: number; mode: string }]>('submit')![0]
    expect(payload.lat).toBe(51.5074)
    expect(payload.lng).toBe(-0.1278)
    expect(payload.duration).toBe(30)
    expect(payload.mode).toBe('walk')
  })

  it('emits submit with the selected mode when changed to bike', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="duration"]').setValue('30')
    await wrapper.find('input[data-testid="mode-bike"]').trigger('change')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ mode: string }]>('submit')![0]
    expect(payload.mode).toBe('bike')
  })

  it('emits submit with drive mode when drive radio is selected', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="duration"]').setValue('30')
    await wrapper.find('input[data-testid="mode-drive"]').trigger('change')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ mode: string }]>('submit')![0]
    expect(payload.mode).toBe('drive')
  })

  it('calls trackModeToggle when the mode changes', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="mode-bike"]').trigger('change')
    expect(trackModeToggle).toHaveBeenCalledOnce()
    expect(trackModeToggle).toHaveBeenCalledWith('bike')
  })

  it('does not emit submit when lat is empty', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="duration"]').setValue('30')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('does not emit submit when lng is empty', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="duration"]').setValue('30')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('does not emit submit when duration is empty', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('fills lat and lng inputs when AddressAutocomplete emits select', async () => {
    const wrapper = mount(IsochroneForm, {
      global: { stubs: { AddressAutocomplete: true } },
    })
    const suggestion: GeocodingSuggestion = { label: 'Portland, OR, USA', lat: 45.5231, lng: -122.6784 }
    await wrapper.findComponent({ name: 'AddressAutocomplete' }).vm.$emit('select', suggestion)

    expect((wrapper.find('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('45.5231')
    expect((wrapper.find('input[data-testid="lng"]').element as HTMLInputElement).value).toBe('-122.6784')
  })

  it('submits with coordinates filled by autocomplete selection', async () => {
    const wrapper = mount(IsochroneForm, {
      global: { stubs: { AddressAutocomplete: true } },
    })
    const suggestion: GeocodingSuggestion = { label: 'Portland, OR, USA', lat: 45.5231, lng: -122.6784 }
    await wrapper.findComponent({ name: 'AddressAutocomplete' }).vm.$emit('select', suggestion)
    await wrapper.find('input[data-testid="duration"]').setValue('30')
    await wrapper.find('form').trigger('submit')

    const [payload] = wrapper.emitted<[{ lat: number; lng: number; duration: number; mode: string }]>('submit')![0]
    expect(payload.lat).toBe(45.5231)
    expect(payload.lng).toBe(-122.6784)
    expect(payload.duration).toBe(30)
    expect(payload.mode).toBe('walk')
  })
})
