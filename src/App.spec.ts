import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

vi.mock('./analytics/index', () => ({
  trackPageView: vi.fn(),
}))

import { trackPageView } from './analytics/index'

describe('App', () => {
  beforeEach(() => {
    vi.mocked(trackPageView).mockClear()
  })

  it('renders the app title', () => {
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    expect(wrapper.get('h1').text()).toBe('Sparks Effect')
  })

  it('tracks a page view on mount', () => {
    mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    expect(trackPageView).toHaveBeenCalledOnce()
    expect(trackPageView).toHaveBeenCalledWith('/')
  })

  it('passes origin to MapView when IsochroneForm emits origin-change', async () => {
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', { lat: 51.5074, lng: -0.1278 })
    expect(wrapper.findComponent({ name: 'MapView' }).props('origin')).toEqual({ lat: 51.5074, lng: -0.1278 })
  })

  it('clears MapView origin when IsochroneForm emits origin-change with null', async () => {
    const wrapper = mount(App, {
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', { lat: 51.5074, lng: -0.1278 })
    await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('origin-change', null)
    expect(wrapper.findComponent({ name: 'MapView' }).props('origin')).toBeNull()
  })
})
