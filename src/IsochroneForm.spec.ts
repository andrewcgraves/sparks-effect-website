import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IsochroneForm from './IsochroneForm.vue'
import type { GeocodingSuggestion } from './api/geocoding'

describe('IsochroneForm', () => {
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

  it('emits submit with lat, lng, and duration as numbers', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="duration"]').setValue('30')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ lat: number; lng: number; duration: number }]>('submit')![0]
    expect(payload.lat).toBe(51.5074)
    expect(payload.lng).toBe(-0.1278)
    expect(payload.duration).toBe(30)
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

  it('emits origin-change with coordinates when both lat and lng are valid', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    const emissions = wrapper.emitted<[{ lat: number; lng: number } | null]>('origin-change')!
    expect(emissions).toBeDefined()
    const lastEmit = emissions[emissions.length - 1][0]
    expect(lastEmit).toEqual({ lat: 51.5074, lng: -0.1278 })
  })

  it('emits origin-change with null when lat is cleared', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="lat"]').setValue('')
    const emissions = wrapper.emitted<[{ lat: number; lng: number } | null]>('origin-change')!
    const lastEmit = emissions[emissions.length - 1][0]
    expect(lastEmit).toBeNull()
  })

  it('emits origin-change with null when lng is cleared', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="lng"]').setValue('')
    const emissions = wrapper.emitted<[{ lat: number; lng: number } | null]>('origin-change')!
    const lastEmit = emissions[emissions.length - 1][0]
    expect(lastEmit).toBeNull()
  })

  it('emits origin-change when autocomplete select fills lat and lng', async () => {
    const wrapper = mount(IsochroneForm, {
      global: { stubs: { AddressAutocomplete: true } },
    })
    const suggestion: GeocodingSuggestion = { label: 'Portland, OR, USA', lat: 45.5231, lng: -122.6784 }
    await wrapper.findComponent({ name: 'AddressAutocomplete' }).vm.$emit('select', suggestion)
    const emissions = wrapper.emitted<[{ lat: number; lng: number } | null]>('origin-change')!
    expect(emissions).toBeDefined()
    const lastEmit = emissions[emissions.length - 1][0]
    expect(lastEmit).toEqual({ lat: 45.5231, lng: -122.6784 })
  })

  it('submits with coordinates filled by autocomplete selection', async () => {
    const wrapper = mount(IsochroneForm, {
      global: { stubs: { AddressAutocomplete: true } },
    })
    const suggestion: GeocodingSuggestion = { label: 'Portland, OR, USA', lat: 45.5231, lng: -122.6784 }
    await wrapper.findComponent({ name: 'AddressAutocomplete' }).vm.$emit('select', suggestion)
    await wrapper.find('input[data-testid="duration"]').setValue('30')
    await wrapper.find('form').trigger('submit')

    const [payload] = wrapper.emitted<[{ lat: number; lng: number; duration: number }]>('submit')![0]
    expect(payload.lat).toBe(45.5231)
    expect(payload.lng).toBe(-122.6784)
    expect(payload.duration).toBe(30)
  })
})
