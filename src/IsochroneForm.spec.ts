import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import IsochroneForm from './IsochroneForm.vue'
import type { GeocodingSuggestion } from './api/geocoding'

vi.mock('./analytics/index', () => ({
  trackModeToggle: vi.fn(),
}))

vi.mock('./api/geolocation', () => ({
  getCurrentPosition: vi.fn(),
}))

vi.mock('./api/geocoding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/geocoding')>()
  return {
    ...actual,
    reverseGeocode: vi.fn(),
  }
})

import { trackModeToggle } from './analytics/index'
import { getCurrentPosition } from './api/geolocation'
import { reverseGeocode } from './api/geocoding'

describe('IsochroneForm', () => {
  beforeEach(() => {
    vi.mocked(trackModeToggle).mockClear()
    vi.mocked(getCurrentPosition).mockReset()
    vi.mocked(reverseGeocode).mockReset()
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

  it('renders a mode dropdown with walk, bike, and drive options', () => {
    const wrapper = mount(IsochroneForm)
    const select = wrapper.find('select[data-testid="mode"]')
    expect(select.exists()).toBe(true)
    const optionValues = select.findAll('option').map((o) => o.attributes('value'))
    expect(optionValues).toEqual(['walk', 'bike', 'drive'])
  })

  it('defaults to walk mode', () => {
    const wrapper = mount(IsochroneForm)
    expect((wrapper.find('select[data-testid="mode"]').element as HTMLSelectElement).value).toBe('walk')
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
    await wrapper.find('select[data-testid="mode"]').setValue('bike')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ mode: string }]>('submit')![0]
    expect(payload.mode).toBe('bike')
  })

  it('emits submit with drive mode when drive is selected', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="duration"]').setValue('30')
    await wrapper.find('select[data-testid="mode"]').setValue('drive')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ mode: string }]>('submit')![0]
    expect(payload.mode).toBe('drive')
  })

  it('calls trackModeToggle when the mode changes', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('select[data-testid="mode"]').setValue('bike')
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

    const [payload] = wrapper.emitted<[{ lat: number; lng: number; duration: number; mode: string }]>('submit')![0]
    expect(payload.lat).toBe(45.5231)
    expect(payload.lng).toBe(-122.6784)
    expect(payload.duration).toBe(30)
    expect(payload.mode).toBe('walk')
  })

  it('renders a use-current-location button', () => {
    const wrapper = mount(IsochroneForm)
    const button = wrapper.find('[data-testid="use-current-location"]')
    expect(button.exists()).toBe(true)
    expect(button.attributes('type')).toBe('button')
  })

  it('fills lat, lng, address, and emits origin-change when use-current-location succeeds', async () => {
    vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 45.5231, lng: -122.6784 })
    const suggestion: GeocodingSuggestion = {
      label: 'Portland, Multnomah County, Oregon, United States',
      lat: 45.5231,
      lng: -122.6784,
    }
    vi.mocked(reverseGeocode).mockResolvedValue(suggestion)

    const wrapper = mount(IsochroneForm)
    await wrapper.find('[data-testid="use-current-location"]').trigger('click')
    await flushPromises()

    expect((wrapper.find('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('45.5231')
    expect((wrapper.find('input[data-testid="lng"]').element as HTMLInputElement).value).toBe('-122.6784')
    expect(wrapper.find('[data-testid="selected-label"]').text()).toBe(suggestion.label)
    expect(wrapper.find('[data-testid="address-input"]').element as HTMLInputElement).toHaveProperty('value', suggestion.label)

    const emissions = wrapper.emitted<[{ lat: number; lng: number } | null]>('origin-change')!
    const lastEmit = emissions[emissions.length - 1][0]
    expect(lastEmit).toEqual({ lat: 45.5231, lng: -122.6784 })
  })

  it('fills lat and lng but leaves address empty when reverse geocode fails', async () => {
    vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 45.5231, lng: -122.6784 })
    vi.mocked(reverseGeocode).mockResolvedValue(null)

    const wrapper = mount(IsochroneForm)
    await wrapper.find('[data-testid="use-current-location"]').trigger('click')
    await flushPromises()

    expect((wrapper.find('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('45.5231')
    expect((wrapper.find('input[data-testid="lng"]').element as HTMLInputElement).value).toBe('-122.6784')
    expect(wrapper.find('[data-testid="selected-label"]').exists()).toBe(false)
    expect((wrapper.find('[data-testid="address-input"]').element as HTMLInputElement).value).toBe('')
  })

  it('shows an error and does not fill fields when geolocation fails', async () => {
    vi.mocked(getCurrentPosition).mockRejectedValue(new Error('permission denied'))

    const wrapper = mount(IsochroneForm)
    await wrapper.find('[data-testid="use-current-location"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="location-error"]').exists()).toBe(true)
    expect((wrapper.find('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('input[data-testid="lng"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('origin-change')).toBeUndefined()
  })

  it('ignores overlapping use-current-location clicks while locating', async () => {
    let resolvePosition!: (value: { lat: number; lng: number }) => void
    vi.mocked(getCurrentPosition).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePosition = resolve
        }),
    )
    vi.mocked(reverseGeocode).mockResolvedValue({
      label: 'Portland, OR, USA',
      lat: 45.5231,
      lng: -122.6784,
    })

    const wrapper = mount(IsochroneForm)
    const button = wrapper.find('[data-testid="use-current-location"]')
    await button.trigger('click')
    await button.trigger('click')

    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect((button.element as HTMLButtonElement).disabled).toBe(true)

    resolvePosition({ lat: 45.5231, lng: -122.6784 })
    await flushPromises()
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
  })
})
