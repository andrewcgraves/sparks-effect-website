import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AddressAutocomplete from './AddressAutocomplete.vue'
import * as geocoding from '../api/geocoding'
import type { GeocodingSuggestion } from '../api/geocoding'

const portlandSuggestion: GeocodingSuggestion = {
  label: 'Portland, OR, USA',
  lat: 45.5231,
  lng: -122.6784,
}

const chicagoSuggestion: GeocodingSuggestion = {
  label: 'Chicago, IL, USA',
  lat: 41.8781,
  lng: -87.6298,
}

describe('AddressAutocomplete', () => {
  beforeEach(() => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a text input', () => {
    const wrapper = mount(AddressAutocomplete)
    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
  })

  it('shows no suggestions list initially', () => {
    const wrapper = mount(AddressAutocomplete)
    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(false)
  })

  it('calls fetchSuggestions when the user types', async () => {
    const wrapper = mount(AddressAutocomplete)
    const input = wrapper.find('input')

    await input.setValue('Portland')
    await flushPromises()

    expect(geocoding.fetchSuggestions).toHaveBeenCalledWith('Portland')
  })

  it('displays suggestions returned by the API', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandSuggestion, chicagoSuggestion])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await flushPromises()

    const list = wrapper.find('[data-testid="suggestions"]')
    expect(list.exists()).toBe(true)
    const items = list.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toBe('Portland, OR, USA')
    expect(items[1].text()).toBe('Chicago, IL, USA')
  })

  it('emits "select" with validated lat/lng when user clicks a suggestion', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandSuggestion])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await flushPromises()

    await wrapper.find('[data-testid="suggestions"] li').trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0][0]).toEqual({
      label: 'Portland, OR, USA',
      lat: 45.5231,
      lng: -122.6784,
    })
  })

  it('hides the suggestions list after a selection', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandSuggestion])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await flushPromises()

    await wrapper.find('[data-testid="suggestions"] li').trigger('click')

    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(false)
  })

  it('sets the input value to the selected suggestion label after selection', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandSuggestion])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await flushPromises()

    await wrapper.find('[data-testid="suggestions"] li').trigger('click')

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Portland, OR, USA')
  })

  it('does NOT emit "select" when the user types without choosing a suggestion', async () => {
    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('some free text address')
    await flushPromises()

    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('clears previous selection when user edits the input after a selection', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions')
      .mockResolvedValueOnce([portlandSuggestion])
      .mockResolvedValue([])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await flushPromises()
    await wrapper.find('[data-testid="suggestions"] li').trigger('click')

    await wrapper.find('input').setValue('Port modified')
    await flushPromises()

    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('does not show suggestions when the API returns an empty list', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('xyzzy')
    await flushPromises()

    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(false)
  })
})
