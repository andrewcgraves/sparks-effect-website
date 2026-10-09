import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import AddressAutocomplete from './AddressAutocomplete.vue'
import * as geocoding from '../api/geocoding'
import { GeocoderUnavailableError, type AddressMatch, type GeocodingSuggestion } from '../api/geocoding'

const UNAVAILABLE = 'Address search is unavailable. Click the map to choose a point.'

const portlandMatch: AddressMatch = { label: 'Portland, OR, USA', gid: 'whosonfirst:locality:101715829' }
const chicagoMatch: AddressMatch = { label: 'Chicago, IL, USA', gid: 'whosonfirst:locality:85940195' }

const portlandSuggestion: GeocodingSuggestion = {
  label: 'Portland, OR, USA',
  lat: 45.5231,
  lng: -122.6784,
}

describe('AddressAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([])
    vi.spyOn(geocoding, 'lookupPlace').mockResolvedValue(portlandSuggestion)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders a text input', () => {
    const wrapper = mount(AddressAutocomplete)
    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
  })

  it('labels the field "Location"', () => {
    const wrapper = mount(AddressAutocomplete)
    expect(wrapper.find('label').text()).toContain('Location')
  })

  it('shows no suggestions list initially', () => {
    const wrapper = mount(AddressAutocomplete)
    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(false)
  })

  it('calls fetchSuggestions when the user types', async () => {
    const wrapper = mount(AddressAutocomplete)

    await wrapper.find('input').setValue('Portland')
    await vi.advanceTimersByTimeAsync(350)

    expect(geocoding.fetchSuggestions).toHaveBeenCalledWith('Portland', expect.any(AbortSignal))
  })

  it('debounces input: rapid typing only triggers one fetch', async () => {
    const wrapper = mount(AddressAutocomplete)
    const input = wrapper.find('input')

    await input.setValue('P')
    await input.setValue('Po')
    await input.setValue('Por')

    expect(geocoding.fetchSuggestions).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(350)

    expect(geocoding.fetchSuggestions).toHaveBeenCalledTimes(1)
    expect(geocoding.fetchSuggestions).toHaveBeenCalledWith('Por', expect.any(AbortSignal))
  })

  it('shows loading indicator while fetching', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockReturnValue(new Promise(() => {}))

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Portland')
    vi.advanceTimersByTime(350)
    await nextTick()

    expect(wrapper.find('[data-testid="suggestions-loading"]').exists()).toBe(true)
  })

  it('displays suggestions returned by the API', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandMatch, chicagoMatch])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await vi.advanceTimersByTimeAsync(350)

    const list = wrapper.find('[data-testid="suggestions"]')
    expect(list.exists()).toBe(true)
    const items = list.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toBe('Portland, OR, USA')
    expect(items[1].text()).toBe('Chicago, IL, USA')
  })

  it('emits "select" with the looked-up lat/lng when user clicks a suggestion', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandMatch])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await vi.advanceTimersByTimeAsync(350)

    await wrapper.find('[data-testid="suggestions"] li').trigger('click')
    await flushPromises()

    expect(geocoding.lookupPlace).toHaveBeenCalledWith(portlandMatch, expect.any(AbortSignal))
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0][0]).toEqual({
      label: 'Portland, OR, USA',
      lat: 45.5231,
      lng: -122.6784,
    })
  })

  it('hides the suggestions list after a selection', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandMatch])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await vi.advanceTimersByTimeAsync(350)

    await wrapper.find('[data-testid="suggestions"] li').trigger('click')

    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(false)
  })

  it('sets the input value to the selected suggestion label after selection', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandMatch])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await vi.advanceTimersByTimeAsync(350)

    await wrapper.find('[data-testid="suggestions"] li').trigger('click')

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Portland, OR, USA')
  })

  it('does NOT emit "select" when the user types without choosing a suggestion', async () => {
    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('some free text address')
    await vi.advanceTimersByTimeAsync(350)

    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('clears previous selection when user edits the input after a selection', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions')
      .mockResolvedValueOnce([portlandMatch])
      .mockResolvedValue([])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await vi.advanceTimersByTimeAsync(350)
    await wrapper.find('[data-testid="suggestions"] li').trigger('click')

    await wrapper.find('input').setValue('Port modified')
    await vi.advanceTimersByTimeAsync(350)

    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('does not show suggestions when the API returns an empty list', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('xyzzy')
    await vi.advanceTimersByTimeAsync(350)

    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(false)
  })

  it('shows empty state in foldout when lookup returns no results', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('xyzzy')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.find('[data-testid="suggestions-empty"]').exists()).toBe(true)
  })

  it('shows results when Enter is pressed without a prior selection', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandMatch])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Portland')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(geocoding.fetchSuggestions).toHaveBeenCalledWith('Portland', expect.any(AbortSignal))
    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(true)
  })

  it('does not fetch on Enter when the input is empty', async () => {
    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(geocoding.fetchSuggestions).not.toHaveBeenCalled()
  })

  it('does not search until at least three characters are typed', async () => {
    const wrapper = mount(AddressAutocomplete)

    await wrapper.find('input').setValue('Po')
    await vi.advanceTimersByTimeAsync(350)
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(geocoding.fetchSuggestions).not.toHaveBeenCalled()
    expect(wrapper.find('#address-suggestions').exists()).toBe(false)
  })

  it('says search is unavailable, not "No results found", when the provider fails', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockRejectedValue(new GeocoderUnavailableError(429))

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Diridon')
    await vi.advanceTimersByTimeAsync(350)

    expect(wrapper.find('[data-testid="suggestions-unavailable"]').text()).toBe(UNAVAILABLE)
    expect(wrapper.find('[data-testid="suggestions-empty"]').exists()).toBe(false)
  })

  it('clears the unavailable message once a later search succeeds', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions')
      .mockRejectedValueOnce(new GeocoderUnavailableError(500))
      .mockResolvedValue([portlandMatch])

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Portl')
    await vi.advanceTimersByTimeAsync(350)
    await wrapper.find('input').setValue('Portla')
    await vi.advanceTimersByTimeAsync(350)

    expect(wrapper.find('[data-testid="suggestions-unavailable"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="suggestions"] li')).toHaveLength(1)
  })

  it('says search is unavailable and emits nothing when looking up the picked match fails', async () => {
    vi.spyOn(geocoding, 'fetchSuggestions').mockResolvedValue([portlandMatch])
    vi.spyOn(geocoding, 'lookupPlace').mockRejectedValue(new GeocoderUnavailableError(429))

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Port')
    await vi.advanceTimersByTimeAsync(350)
    await wrapper.find('[data-testid="suggestions"] li').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.find('[data-testid="suggestions-unavailable"]').text()).toBe(UNAVAILABLE)
  })

  it('cancels the in-flight search when the user keeps typing, and ignores its late answer', async () => {
    const signals: AbortSignal[] = []
    let answerFirst: (matches: AddressMatch[]) => void = () => {}
    vi.spyOn(geocoding, 'fetchSuggestions')
      .mockImplementationOnce((_query, signal) => {
        signals.push(signal!)
        return new Promise((resolve) => (answerFirst = resolve))
      })
      .mockImplementationOnce(async (_query, signal) => {
        signals.push(signal!)
        return [chicagoMatch]
      })

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Chic')
    await vi.advanceTimersByTimeAsync(350)
    await wrapper.find('input').setValue('Chica')
    await vi.advanceTimersByTimeAsync(350)
    answerFirst([portlandMatch])
    await flushPromises()

    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    const items = wrapper.findAll('[data-testid="suggestions"] li')
    expect(items.map((item) => item.text())).toEqual(['Chicago, IL, USA'])
  })

  it('cancels the in-flight search on the next keystroke, before its debounce elapses', async () => {
    let firstSignal: AbortSignal | undefined
    vi.spyOn(geocoding, 'fetchSuggestions').mockImplementationOnce((_query, signal) => {
      firstSignal = signal
      return new Promise(() => {})
    })

    const wrapper = mount(AddressAutocomplete)
    await wrapper.find('input').setValue('Chic')
    await vi.advanceTimersByTimeAsync(350)
    await wrapper.find('input').setValue('Chica')

    expect(firstSignal?.aborted).toBe(true)
  })

  it('credits the geocoder’s data sources under the box', () => {
    const wrapper = mount(AddressAutocomplete)

    const credit = wrapper.find('[data-testid="geocoder-attribution"]')
    expect(credit.text()).toContain('Stadia Maps')
    expect(credit.text()).toContain('OpenStreetMap contributors')
    expect(credit.find('a[href="https://stadiamaps.com/attribution/"]').exists()).toBe(true)
    expect(credit.find('a[href="https://www.openstreetmap.org/copyright"]').exists()).toBe(true)
  })
})
