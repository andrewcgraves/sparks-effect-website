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

  it('renders a duration slider', () => {
    const wrapper = mount(IsochroneForm)
    expect(wrapper.find('input[data-testid="duration-slider"]').exists()).toBe(true)
  })

  it('defaults duration to 30 on both the number input and the slider', () => {
    const wrapper = mount(IsochroneForm)
    expect((wrapper.find('input[data-testid="duration"]').element as HTMLInputElement).value).toBe('30')
    expect((wrapper.find('input[data-testid="duration-slider"]').element as HTMLInputElement).value).toBe('30')
  })

  it('syncs the number input when the slider changes', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="duration-slider"]').setValue('75')
    expect((wrapper.find('input[data-testid="duration"]').element as HTMLInputElement).value).toBe('75')
  })

  it('syncs the slider when the number input is blurred with a valid value', async () => {
    const wrapper = mount(IsochroneForm)
    const durationInput = wrapper.find('input[data-testid="duration"]')
    await durationInput.setValue('90')
    await durationInput.trigger('blur')
    expect((wrapper.find('input[data-testid="duration-slider"]').element as HTMLInputElement).value).toBe('90')
  })

  it('clamps the number input to 120 on blur when it exceeds the max', async () => {
    const wrapper = mount(IsochroneForm)
    const durationInput = wrapper.find('input[data-testid="duration"]')
    await durationInput.setValue('500')
    await durationInput.trigger('blur')
    expect((durationInput.element as HTMLInputElement).value).toBe('120')
    expect((wrapper.find('input[data-testid="duration-slider"]').element as HTMLInputElement).value).toBe('120')
  })

  it('clamps the number input to 0 on blur when it is negative', async () => {
    const wrapper = mount(IsochroneForm)
    const durationInput = wrapper.find('input[data-testid="duration"]')
    await durationInput.setValue('-10')
    await durationInput.trigger('blur')
    expect((durationInput.element as HTMLInputElement).value).toBe('0')
  })

  it('rounds the number input to the nearest integer on blur', async () => {
    const wrapper = mount(IsochroneForm)
    const durationInput = wrapper.find('input[data-testid="duration"]')
    await durationInput.setValue('45.6')
    await durationInput.trigger('blur')
    expect((durationInput.element as HTMLInputElement).value).toBe('46')
  })

  it('reverts to the last valid value on blur when the input is emptied', async () => {
    const wrapper = mount(IsochroneForm)
    const durationInput = wrapper.find('input[data-testid="duration"]')
    await durationInput.setValue('')
    await durationInput.trigger('blur')
    expect((durationInput.element as HTMLInputElement).value).toBe('30')
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
    expect(wrapper.find('.address-autocomplete input').element as HTMLInputElement).toHaveProperty('value', suggestion.label)

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
    expect((wrapper.find('.address-autocomplete input').element as HTMLInputElement).value).toBe('')
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

  it('disables the submit button when lat and lng are empty', () => {
    const wrapper = mount(IsochroneForm)
    expect((wrapper.find('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables the submit button when only lat is filled', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    expect((wrapper.find('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables the submit button when the duration is 0', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="duration-slider"]').setValue('0')
    expect((wrapper.find('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables the submit button when lat, lng, and a non-zero duration are present', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    expect((wrapper.find('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the insufficient-data hint while the button is disabled', () => {
    const wrapper = mount(IsochroneForm)
    const hint = wrapper.find('[data-testid="submit-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('Enter a location and travel time to continue.')
  })

  it('hides the hint once the form is valid', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    expect(wrapper.find('[data-testid="submit-hint"]').exists()).toBe(false)
  })

  it('renders the error prop under the submit button, taking precedence over the hint', () => {
    const wrapper = mount(IsochroneForm, {
      props: { error: 'Failed to generate isochrone. Please try again.' },
    })
    const error = wrapper.find('[data-testid="fetch-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('Failed to generate isochrone. Please try again.')
    expect(error.attributes('role')).toBe('alert')
    expect(wrapper.find('[data-testid="submit-hint"]').exists()).toBe(false)
  })

  it('clears the displayed error when a field is edited', async () => {
    const wrapper = mount(IsochroneForm, {
      props: { error: 'Failed to generate isochrone. Please try again.' },
    })
    expect(wrapper.find('[data-testid="fetch-error"]').exists()).toBe(true)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    expect(wrapper.find('[data-testid="fetch-error"]').exists()).toBe(false)
  })

  it('disables the submit button and relabels it while loading', () => {
    const wrapper = mount(IsochroneForm, { props: { loading: true } })
    const button = wrapper.find('button[type="submit"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(button.text()).toBe('Generating…')
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
