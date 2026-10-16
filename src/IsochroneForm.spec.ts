import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
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

// The form's location buttons sit in the field's trailing slot, so a stub
// that stands in for the field still has to render it.
const AddressAutocompleteStub = defineComponent({
  name: 'AddressAutocomplete',
  emits: ['select'],
  setup(_, { expose, slots }) {
    expose({ setInputValue: () => {} })
    return () => h('div', slots.trailing?.())
  },
})

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

  it.each(['lat', 'lng'])('lets a scroll over the focused %s field move the page instead of the value', async (field) => {
    const wrapper = mount(IsochroneForm, { attachTo: document.body })
    const input = wrapper.find(`input[data-testid="${field}"]`)
    await input.setValue('37.7749')
    const element = input.element as HTMLInputElement
    element.focus()
    expect(document.activeElement).toBe(element)

    const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    element.dispatchEvent(wheel)

    expect(element.value).toBe('37.7749')
    expect(document.activeElement).not.toBe(element)
    expect(wheel.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('renders a duration slider', () => {
    const wrapper = mount(IsochroneForm)
    expect(wrapper.find('[data-testid="duration-slider"]').exists()).toBe(true)
  })

  it('defaults duration to 60', () => {
    const wrapper = mount(IsochroneForm)
    expect((wrapper.find('input[data-testid="duration-slider-option-60"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('restricts the duration slider to 45, 60, 75, 120, 180, and 240 minutes', () => {
    const wrapper = mount(IsochroneForm)
    for (const minutes of [45, 60, 75, 120, 180, 240]) {
      const option = wrapper.find(`input[data-testid="duration-slider-option-${minutes}"]`)
      expect(option.element.parentElement?.textContent?.trim()).toBe(`${minutes} min`)
    }
  })

  it('keeps the travel-time options out of the label, so they do not take its letter-spacing', () => {
    const wrapper = mount(IsochroneForm)
    expect(wrapper.get('[data-testid="duration-slider"]').element.closest('.text-micro')).toBeNull()
  })

  it('moves the duration to the option that was selected', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="duration-slider-option-75"]').setValue(true)
    expect((wrapper.find('input[data-testid="duration-slider-option-75"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('renders walk, bike, drive, and transit mode radio buttons', () => {
    const wrapper = mount(IsochroneForm)
    expect(wrapper.find('input[data-testid="mode-walk"]').exists()).toBe(true)
    expect(wrapper.find('input[data-testid="mode-bike"]').exists()).toBe(true)
    expect(wrapper.find('input[data-testid="mode-drive"]').exists()).toBe(true)
    expect(wrapper.find('input[data-testid="mode-transit"]').exists()).toBe(true)
  })

  it('defaults to walk mode', () => {
    const wrapper = mount(IsochroneForm)
    expect((wrapper.find('input[data-testid="mode-walk"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('input[data-testid="mode-bike"]').element as HTMLInputElement).checked).toBe(false)
    expect((wrapper.find('input[data-testid="mode-drive"]').element as HTMLInputElement).checked).toBe(false)
    expect((wrapper.find('input[data-testid="mode-transit"]').element as HTMLInputElement).checked).toBe(false)
  })

  it('emits submit with lat, lng, duration, and mode as numbers and string', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ lat: number; lng: number; duration: number; mode: string }]>('submit')![0]
    expect(payload.lat).toBe(51.5074)
    expect(payload.lng).toBe(-0.1278)
    expect(payload.duration).toBe(60)
    expect(payload.mode).toBe('walk')
  })

  it('emits submit with the selected mode when changed to bike', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="mode-bike"]').trigger('change')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ mode: string }]>('submit')![0]
    expect(payload.mode).toBe('bike')
  })

  it('emits submit with drive mode when drive radio is selected', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="mode-drive"]').trigger('change')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ mode: string }]>('submit')![0]
    expect(payload.mode).toBe('drive')
  })

  it('emits submit with transit mode when transit radio is selected', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('input[data-testid="mode-transit"]').trigger('change')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted<[{ mode: string }]>('submit')![0]
    expect(payload.mode).toBe('transit')
  })

  it('calls trackModeToggle when the mode changes', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="mode-bike"]').trigger('change')
    expect(trackModeToggle).toHaveBeenCalledOnce()
    expect(trackModeToggle).toHaveBeenCalledWith('bike')
  })

  it('calls trackModeToggle with transit when that radio is selected', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="mode-transit"]').trigger('change')
    expect(trackModeToggle).toHaveBeenCalledWith('transit')
  })

  it('does not emit submit when lat is empty', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('does not emit submit when lng is empty', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
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
    await wrapper.find('form').trigger('submit')

    const [payload] = wrapper.emitted<[{ lat: number; lng: number; duration: number; mode: string }]>('submit')![0]
    expect(payload.lat).toBe(45.5231)
    expect(payload.lng).toBe(-122.6784)
    expect(payload.duration).toBe(60)
    expect(payload.mode).toBe('walk')
  })

  it('renders a use-current-location button', () => {
    const wrapper = mount(IsochroneForm)
    const button = wrapper.find('[data-testid="use-current-location"]')
    expect(button.exists()).toBe(true)
    expect(button.attributes('type')).toBe('button')
  })

  it('names the use-current-location icon button for screen readers and hides its icon', () => {
    const wrapper = mount(IsochroneForm)
    const button = wrapper.get('[data-testid="use-current-location"]')
    expect(button.attributes('aria-label')).toBe('Use my location')
    expect(button.text()).toBe('')
    expect(button.get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('sits the use-current-location button in a row with the location input', () => {
    const wrapper = mount(IsochroneForm)
    const button = wrapper.get('[data-testid="use-current-location"]')
    expect(button.element.parentElement?.querySelector('input[role="combobox"]')).not.toBeNull()
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
    expect(wrapper.find('.address-autocomplete input').element as HTMLInputElement).toHaveProperty('value', suggestion.label)
    expect(wrapper.find('[data-testid="selected-label"]').exists()).toBe(false)

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

  it('enables the submit button when lat, lng, and a non-zero duration are present', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    expect((wrapper.find('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('asks for a starting point on the disabled button rather than in a hint', () => {
    const wrapper = mount(IsochroneForm)
    expect(wrapper.get('button[type="submit"]').text()).toBe('Choose a starting point first')
    expect(wrapper.find('[data-testid="submit-hint"]').exists()).toBe(false)
  })

  it('names the plot on the button once there is a starting point', async () => {
    const wrapper = mount(IsochroneForm)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    await wrapper.find('input[data-testid="lng"]').setValue('-0.1278')
    expect(wrapper.get('button[type="submit"]').text()).toBe('Plot a 60-min walk')

    await wrapper.get('input[data-testid="mode-transit"]').trigger('change')
    await wrapper.get('input[data-testid="duration-slider-option-120"]').trigger('change')
    expect(wrapper.get('button[type="submit"]').text()).toBe('Plot a 120-min transit trip')
  })

  it('renders the error prop under the submit button', () => {
    const wrapper = mount(IsochroneForm, {
      props: { error: "Couldn't plot this splash zone. Please try again." },
    })
    const error = wrapper.find('[data-testid="fetch-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe("Couldn't plot this splash zone. Please try again.")
    expect(error.attributes('role')).toBe('alert')
  })

  it('clears the displayed error when a field is edited', async () => {
    const wrapper = mount(IsochroneForm, {
      props: { error: "Couldn't plot this splash zone. Please try again." },
    })
    expect(wrapper.find('[data-testid="fetch-error"]').exists()).toBe(true)
    await wrapper.find('input[data-testid="lat"]').setValue('51.5074')
    expect(wrapper.find('[data-testid="fetch-error"]').exists()).toBe(false)
  })

  it('disables the submit button and relabels it while loading', () => {
    const wrapper = mount(IsochroneForm, { props: { loading: true } })
    const button = wrapper.find('button[type="submit"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(button.text()).toBe('Plotting…')
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

  describe('picking the origin on the map', () => {
    function pickButton(wrapper: ReturnType<typeof mount>) {
      return wrapper.find('[data-testid="pick-on-map"]')
    }

    function lastPickArmed(wrapper: ReturnType<typeof mount>): boolean | undefined {
      const emissions = wrapper.emitted<[boolean]>('pick-armed')
      return emissions?.[emissions.length - 1][0]
    }

    // The click itself belongs to the map; the parent relays it in through the
    // form's exposed setter, which is what this stands in for.
    async function pickOnMap(wrapper: ReturnType<typeof mount>, coord: { lat: number; lng: number }) {
      ;(wrapper.vm as unknown as { setOriginFromMap: (coord: { lat: number; lng: number }) => void })
        .setOriginFromMap(coord)
      await wrapper.vm.$nextTick()
    }

    it('renders a pick-on-map button alongside use-current-location', () => {
      const wrapper = mount(IsochroneForm)
      const button = pickButton(wrapper)
      expect(button.exists()).toBe(true)
      expect(button.attributes('type')).toBe('button')
      expect(button.attributes('aria-label')).toBe('Pick the starting point on the map')
      expect(button.attributes('aria-pressed')).toBe('false')
    })

    it('sits the pick-on-map button in the starting-point row beside use-current-location', () => {
      const wrapper = mount(IsochroneForm)
      const row = wrapper.get('[data-testid="use-current-location"]').element.parentElement
      expect(row?.contains(pickButton(wrapper).element)).toBe(true)
    })

    it('keeps the pin out of what a screen reader says for the pick-on-map button', () => {
      const wrapper = mount(IsochroneForm)
      const pin = pickButton(wrapper).findAll('[aria-hidden="true"]').map((hidden) => hidden.text())
      expect(pin).toEqual(['📍'])
    })

    it('arms on click and reports it, so the parent can arm the map', async () => {
      const wrapper = mount(IsochroneForm)
      await pickButton(wrapper).trigger('click')

      expect(lastPickArmed(wrapper)).toBe(true)
      expect(pickButton(wrapper).attributes('aria-pressed')).toBe('true')
    })

    it('disarms when the armed button is clicked again', async () => {
      const wrapper = mount(IsochroneForm)
      await pickButton(wrapper).trigger('click')
      await pickButton(wrapper).trigger('click')

      expect(lastPickArmed(wrapper)).toBe(false)
      expect(pickButton(wrapper).attributes('aria-pressed')).toBe('false')
    })

    it('disarms on Escape without touching the origin', async () => {
      const wrapper = mount(IsochroneForm, { attachTo: document.body })
      await wrapper.find('input[data-testid="lat"]').setValue('45.5231')
      await pickButton(wrapper).trigger('click')

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wrapper.vm.$nextTick()

      expect(lastPickArmed(wrapper)).toBe(false)
      expect((wrapper.find('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('45.5231')
      wrapper.unmount()
    })

    it('stops listening for Escape once unmounted', async () => {
      const wrapper = mount(IsochroneForm)
      await pickButton(wrapper).trigger('click')
      wrapper.unmount()

      expect(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).not.toThrow()
    })

    it('fills lat and lng from a map pick and emits origin-change', async () => {
      const wrapper = mount(IsochroneForm)
      await pickButton(wrapper).trigger('click')

      await pickOnMap(wrapper, { lat: 45.5231, lng: -122.6784 })

      expect((wrapper.find('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('45.5231')
      expect((wrapper.find('input[data-testid="lng"]').element as HTMLInputElement).value).toBe('-122.6784')
      const emissions = wrapper.emitted<[{ lat: number; lng: number } | null]>('origin-change')!
      expect(emissions[emissions.length - 1][0]).toEqual({ lat: 45.5231, lng: -122.6784 })
    })

    it('does not submit on a map pick — generating stays an explicit action', async () => {
      const wrapper = mount(IsochroneForm)
      await pickButton(wrapper).trigger('click')

      await pickOnMap(wrapper, { lat: 45.5231, lng: -122.6784 })

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('clears the address field on a map pick, so no stale name contradicts the coords', async () => {
      vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 51.5074, lng: -0.1278 })
      vi.mocked(reverseGeocode).mockResolvedValue({ label: 'London, England', lat: 51.5074, lng: -0.1278 })

      const wrapper = mount(IsochroneForm)
      await wrapper.find('[data-testid="use-current-location"]').trigger('click')
      await flushPromises()
      expect((wrapper.find('.address-autocomplete input').element as HTMLInputElement).value).toBe('London, England')

      await pickButton(wrapper).trigger('click')

      await pickOnMap(wrapper, { lat: 45.5231, lng: -122.6784 })

      expect((wrapper.find('.address-autocomplete input').element as HTMLInputElement).value).toBe('')
    })

    it('disarms after a single pick', async () => {
      const wrapper = mount(IsochroneForm)
      await pickButton(wrapper).trigger('click')

      await pickOnMap(wrapper, { lat: 45.5231, lng: -122.6784 })

      expect(lastPickArmed(wrapper)).toBe(false)
      expect(pickButton(wrapper).attributes('aria-pressed')).toBe('false')
    })

    it('disarms when the origin is set by autocomplete instead', async () => {
      const wrapper = mount(IsochroneForm, {
        global: { stubs: { AddressAutocomplete: AddressAutocompleteStub } },
      })
      await pickButton(wrapper).trigger('click')

      const suggestion: GeocodingSuggestion = { label: 'Portland, OR, USA', lat: 45.5231, lng: -122.6784 }
      await wrapper.findComponent({ name: 'AddressAutocomplete' }).vm.$emit('select', suggestion)

      expect(lastPickArmed(wrapper)).toBe(false)
    })

    it('disarms when the origin is typed into lat/lng instead', async () => {
      const wrapper = mount(IsochroneForm)
      await pickButton(wrapper).trigger('click')

      await wrapper.find('input[data-testid="lat"]').setValue('45.5231')

      expect(lastPickArmed(wrapper)).toBe(false)
    })

    it('disarms when use-current-location is clicked instead', async () => {
      vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 51.5074, lng: -0.1278 })
      vi.mocked(reverseGeocode).mockResolvedValue(null)

      const wrapper = mount(IsochroneForm)
      await pickButton(wrapper).trigger('click')
      await wrapper.find('[data-testid="use-current-location"]').trigger('click')

      expect(lastPickArmed(wrapper)).toBe(false)
      await flushPromises()
    })

    it('ignores a map pick that arrives while disarmed', async () => {
      const wrapper = mount(IsochroneForm)

      await pickOnMap(wrapper, { lat: 45.5231, lng: -122.6784 })

      expect((wrapper.find('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('')
    })
  })

  describe('starting from a shared link', () => {
    it('starts from the origin, mode and budget it is given', async () => {
      const wrapper = mount(IsochroneForm, {
        props: { initial: { lat: 37.33821, lng: -121.88635, mode: 'transit', duration: 120 } },
      })
      expect((wrapper.get('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('37.33821')
      expect((wrapper.get('input[data-testid="lng"]').element as HTMLInputElement).value).toBe('-121.88635')
      expect((wrapper.get('input[data-testid="mode-transit"]').element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get('input[data-testid="duration-slider-option-120"]').element as HTMLInputElement).checked).toBe(true)

      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('submit')?.[0]).toEqual([{ lat: 37.33821, lng: -121.88635, duration: 120, mode: 'transit' }])
    })

    it('keeps its own defaults for whatever it is not given', () => {
      const wrapper = mount(IsochroneForm, { props: { initial: { mode: 'bike' } } })
      expect((wrapper.get('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('')
      expect((wrapper.get('input[data-testid="mode-bike"]').element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get('input[data-testid="duration-slider-option-60"]').element as HTMLInputElement).checked).toBe(true)
    })
  })

  describe('thumb-sized hit areas (SPA-494)', () => {
    it.each(['pick-on-map', 'use-current-location'])('grows the %s icon button to 44px on a touch screen', (testid) => {
      const wrapper = mount(IsochroneForm)
      expect(wrapper.get(`[data-testid="${testid}"]`).classes()).toContain('pointer-coarse:size-11')
    })

    it('makes each mode tile at least 44px tall', () => {
      const wrapper = mount(IsochroneForm)
      for (const mode of ['walk', 'bike', 'drive', 'transit']) {
        const label = wrapper.get(`[data-testid="mode-${mode}"]`).element.closest('label')
        expect(label?.classList.contains('min-h-11')).toBe(true)
      }
    })
  })

  // SPA-506: one way to choose a start shows at a time, and a chosen start is
  // named on a card rather than left in four half-filled controls.
  describe('the starting-point card', () => {
    function card(wrapper: ReturnType<typeof mount>) {
      return wrapper.find('[data-testid="origin-card"]')
    }

    function chooserShown(wrapper: ReturnType<typeof mount>): boolean {
      return (wrapper.get('[data-testid="origin-chooser"]').element as HTMLElement).style.display !== 'none'
    }

    async function pickOnMap(wrapper: ReturnType<typeof mount>, coord: { lat: number; lng: number }) {
      await wrapper.get('[data-testid="pick-on-map"]').trigger('click')
      ;(wrapper.vm as unknown as { setOriginFromMap: (coord: { lat: number; lng: number }) => void })
        .setOriginFromMap(coord)
      await wrapper.vm.$nextTick()
    }

    it('starts with the chooser and keeps the coordinates folded away', () => {
      const wrapper = mount(IsochroneForm)
      expect(card(wrapper).exists()).toBe(false)
      expect(chooserShown(wrapper)).toBe(true)
      const coordinates = wrapper.get('[data-testid="enter-coordinates"]')
      expect(coordinates.element.tagName).toBe('DETAILS')
      expect((coordinates.element as HTMLDetailsElement).open).toBe(false)
      expect(coordinates.get('summary').text()).toBe('Enter coordinates instead')
      expect(coordinates.find('input[data-testid="lat"]').exists()).toBe(true)
    })

    it('styles the coordinates toggle as an action link with no disclosure arrow, and relabels it while open', async () => {
      const wrapper = mount(IsochroneForm)
      const details = wrapper.get('[data-testid="enter-coordinates"]')
      const summary = details.get('summary')
      expect(summary.classes()).toEqual(expect.arrayContaining(['uppercase', 'list-none', '[&::-webkit-details-marker]:hidden']))
      expect(summary.classes()).not.toContain('underline')

      ;(details.element as HTMLDetailsElement).open = true
      await details.trigger('toggle')
      expect(summary.text()).toBe('Hide coordinates')
    })

    it('names an address chosen from search', async () => {
      const wrapper = mount(IsochroneForm, {
        global: { stubs: { AddressAutocomplete: AddressAutocompleteStub } },
      })
      const suggestion: GeocodingSuggestion = { label: 'Portland, OR, USA', lat: 45.5231, lng: -122.6784 }
      await wrapper.findComponent({ name: 'AddressAutocomplete' }).vm.$emit('select', suggestion)

      expect(chooserShown(wrapper)).toBe(false)
      expect(wrapper.get('[data-testid="origin-name"]').text()).toBe('Portland, OR, USA')
      expect(card(wrapper).text()).toContain('45.5231, -122.6784')
    })

    it('calls a map pick a dropped pin, without asking the geocoder for a name', async () => {
      const wrapper = mount(IsochroneForm)
      await pickOnMap(wrapper, { lat: 45.5231, lng: -122.6784 })

      expect(wrapper.get('[data-testid="origin-name"]').text()).toBe('Dropped pin')
      expect(reverseGeocode).not.toHaveBeenCalled()
    })

    it('names the visitor\'s location by its address when the geocoder has one, and as theirs when not', async () => {
      vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 51.5074, lng: -0.1278 })
      vi.mocked(reverseGeocode).mockResolvedValueOnce({ label: 'London, England', lat: 51.5074, lng: -0.1278 })
      const named = mount(IsochroneForm)
      await named.get('[data-testid="use-current-location"]').trigger('click')
      await flushPromises()
      expect(named.get('[data-testid="origin-name"]').text()).toBe('London, England')

      vi.mocked(reverseGeocode).mockResolvedValueOnce(null)
      const unnamed = mount(IsochroneForm)
      await unnamed.get('[data-testid="use-current-location"]').trigger('click')
      await flushPromises()
      expect(unnamed.get('[data-testid="origin-name"]').text()).toBe('Your location')
    })

    it('shows a start from a shared link as a card', () => {
      const wrapper = mount(IsochroneForm, { props: { initial: { lat: 37.33821, lng: -121.88635 } } })
      expect(wrapper.get('[data-testid="origin-name"]').text()).toBe('Starting point')
      expect(chooserShown(wrapper)).toBe(false)
    })

    it('keeps the chooser open while coordinates are typed', async () => {
      const wrapper = mount(IsochroneForm)
      await wrapper.get('input[data-testid="lat"]').setValue('45.5231')
      await wrapper.get('input[data-testid="lng"]').setValue('-122.6784')

      expect(card(wrapper).exists()).toBe(false)
      expect(chooserShown(wrapper)).toBe(true)
    })

    it('reopens the chooser on Change without dropping the pin', async () => {
      const wrapper = mount(IsochroneForm)
      await pickOnMap(wrapper, { lat: 45.5231, lng: -122.6784 })
      const emitted = wrapper.emitted('origin-change')!.length

      await wrapper.get('[data-testid="change-origin"]').trigger('click')

      expect(chooserShown(wrapper)).toBe(true)
      expect(card(wrapper).exists()).toBe(false)
      expect(wrapper.emitted('origin-change')!.length).toBe(emitted)
      expect((wrapper.get('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(false)
    })

    it('goes back to the card when the visitor keeps the start after all', async () => {
      const wrapper = mount(IsochroneForm)
      await pickOnMap(wrapper, { lat: 45.5231, lng: -122.6784 })
      await wrapper.get('[data-testid="change-origin"]').trigger('click')

      await wrapper.get('[data-testid="keep-origin"]').trigger('click')

      expect(wrapper.get('[data-testid="origin-name"]').text()).toBe('Dropped pin')
    })

    it('replaces the card with the new choice after Change', async () => {
      const wrapper = mount(IsochroneForm)
      await pickOnMap(wrapper, { lat: 45.5231, lng: -122.6784 })
      await wrapper.get('[data-testid="change-origin"]').trigger('click')

      await pickOnMap(wrapper, { lat: 37.3382, lng: -121.8863 })

      expect(card(wrapper).text()).toContain('37.3382, -121.8863')
      expect(wrapper.find('[data-testid="keep-origin"]').exists()).toBe(false)
    })
  })

  describe('mode tiles', () => {
    it('shows each mode as a tile with its emoji hidden from screen readers', () => {
      const wrapper = mount(IsochroneForm)
      const tiles = { walk: ['🚶', 'Walk'], bike: ['🚲', 'Bike'], drive: ['🚗', 'Drive'], transit: ['🚆', 'Transit'] }
      for (const [mode, [icon, label]] of Object.entries(tiles)) {
        const tile = wrapper.get(`[data-testid="mode-tile-${mode}"]`)
        expect(tile.get('[aria-hidden="true"]').text()).toBe(icon)
        expect(tile.text()).toContain(label)
        expect(tile.get('input[type="radio"]').classes()).toContain('sr-only')
      }
    })

    it('marks the chosen tile', async () => {
      const wrapper = mount(IsochroneForm)
      await wrapper.get('input[data-testid="mode-bike"]').trigger('change')
      expect(wrapper.get('[data-testid="mode-tile-bike"]').classes()).toContain('border-coral')
      expect(wrapper.get('[data-testid="mode-tile-walk"]').classes()).not.toContain('border-coral')
    })
  })

  // SPA-501: a saved splash zone is a starting point, so choosing one fills
  // the form with the question it answered.
  describe('filled from a saved splash zone', () => {
    function checked(wrapper: ReturnType<typeof mount>, testid: string): boolean {
      return (wrapper.get(`input[data-testid="${testid}"]`).element as HTMLInputElement).checked
    }

    it('takes its starting point, travel time and mode, and moves the pin there', async () => {
      const wrapper = mount(IsochroneForm)

      wrapper.vm.fill({ lat: 34.0555, lng: -118.2341, duration: 120, mode: 'transit' })
      await flushPromises()

      expect((wrapper.get('[data-testid="lat"]').element as HTMLInputElement).value).toBe('34.0555')
      expect((wrapper.get('[data-testid="lng"]').element as HTMLInputElement).value).toBe('-118.2341')
      expect(checked(wrapper, 'duration-slider-option-120')).toBe(true)
      expect(checked(wrapper, 'mode-transit')).toBe(true)
      expect(wrapper.emitted('origin-change')!.at(-1)).toEqual([{ lat: 34.0555, lng: -118.2341 }])
    })

    it('shows a travel time the form does not offer as its own option, not rounded', async () => {
      const wrapper = mount(IsochroneForm)

      wrapper.vm.fill({ lat: 34.0555, lng: -118.2341, duration: 90, mode: 'transit' })
      await flushPromises()

      const options = wrapper.findAll('input[name="duration"]').map((o) => Number((o.element as HTMLInputElement).value))
      expect(options).toEqual([45, 60, 75, 90, 120, 180, 240])
      expect(checked(wrapper, 'duration-slider-option-90')).toBe(true)

      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('submit')![0]).toEqual([{ lat: 34.0555, lng: -118.2341, duration: 90, mode: 'transit' }])
    })

    it('drops the extra option once a later one is on the list', async () => {
      const wrapper = mount(IsochroneForm)

      wrapper.vm.fill({ lat: 1, lng: 2, duration: 90, mode: 'walk' })
      await flushPromises()
      wrapper.vm.fill({ lat: 1, lng: 2, duration: 60, mode: 'walk' })
      await flushPromises()

      expect(wrapper.find('input[data-testid="duration-slider-option-90"]').exists()).toBe(false)
    })
  })

  it('leaves the box and heading to its host when unframed', () => {
    const framed = mount(IsochroneForm)
    const bare = mount(IsochroneForm, { props: { framed: false } })

    expect(framed.find('h2').text()).toBe('Plot a splash zone')
    expect(framed.get('form').classes()).toContain('border')
    expect(bare.find('h2').exists()).toBe(false)
    expect(bare.get('form').classes()).not.toContain('border')
  })
})
