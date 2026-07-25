import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Service } from '../api/authoring/types'
import { ApiError } from '../api/authoring/client'

vi.mock('../api/authoring/services', () => ({
  fetchService: vi.fn(),
}))

import AuthoredServiceView from './AuthoredServiceView.vue'
import { fetchService } from '../api/authoring/services'

const Stub = { template: '<div>stub</div>' }

const stubService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'route-1',
  name: 'Northbound Express',
  description: 'Runs the spine',
  stops: [
    { name: 'Union', lat: 37.7, lng: -122.4, seq: 0 },
    { name: 'Midtown', lat: 37.5, lng: -122.1, seq: 1 },
  ],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1.1, deceleration_ms2: 1.2, dwell_s: 30 },
  frequency_windows: [{ start_time: '06:00', end_time: '22:00', headway_s: 900 }],
}

function mountView(slug = 'northbound-express') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/authoring', name: 'authoring', component: Stub },
      { path: '/authoring/services/:slug', name: 'service-detail', component: AuthoredServiceView, props: true },
    ],
  })
  return mount(AuthoredServiceView, { props: { slug }, global: { plugins: [router] } })
}

describe('AuthoredServiceView', () => {
  beforeEach(() => {
    vi.mocked(fetchService).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the service named by the slug prop', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    mountView()
    await flushPromises()
    expect(fetchService).toHaveBeenCalledWith('northbound-express')
  })

  it('shows the name and slug once loaded', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Northbound Express')
    expect(wrapper.text()).toContain('northbound-express')
  })

  it('lists the stops in order', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="service-stop-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Union')
    expect(rows[1].text()).toContain('Midtown')
  })

  it('orders stops by seq rather than array order', async () => {
    vi.mocked(fetchService).mockResolvedValue({
      ...stubService,
      stops: [
        { name: 'Midtown', lat: 37.5, lng: -122.1, seq: 1 },
        { name: 'Union', lat: 37.7, lng: -122.4, seq: 0 },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="service-stop-row"]')
    expect(rows[0].text()).toContain('Union')
    expect(rows[1].text()).toContain('Midtown')
  })

  it('shows empty states for a service with no stops or frequency windows', async () => {
    vi.mocked(fetchService).mockResolvedValue({ ...stubService, stops: [], frequency_windows: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="service-stops-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="service-windows-empty"]').exists()).toBe(true)
  })

  it('shows the vehicle params and frequency windows', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('320')
    expect(wrapper.findAll('[data-testid="service-window-row"]')).toHaveLength(1)
  })

  it('links back to the authoring page', async () => {
    vi.mocked(fetchService).mockResolvedValue(stubService)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="back-to-authoring"]').attributes('href')).toBe('/authoring')
  })

  it('shows a not-found state on a 404', async () => {
    vi.mocked(fetchService).mockRejectedValue(new ApiError('not found', 404))
    const wrapper = mountView('no-such-service')
    await flushPromises()
    expect(wrapper.find('[data-testid="service-not-found"]').exists()).toBe(true)
  })

  it('shows an error state on a non-404 failure', async () => {
    vi.mocked(fetchService).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="service-error"]').exists()).toBe(true)
  })
})
