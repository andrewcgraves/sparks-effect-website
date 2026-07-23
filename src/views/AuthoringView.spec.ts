import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Service, Scenario } from '../api/authoring/types'

vi.mock('../api/authoring/services', () => ({
  fetchMyServices: vi.fn(),
}))
vi.mock('../api/authoring/scenarios', () => ({
  fetchMyScenarios: vi.fn(),
}))

import AuthoringView from './AuthoringView.vue'
import { fetchMyServices } from '../api/authoring/services'
import { fetchMyScenarios } from '../api/authoring/scenarios'
import { useAuthStore } from '../stores/auth'

const LoginStub = { template: '<div>login</div>' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/authoring', name: 'authoring', component: AuthoringView },
      { path: '/login', name: 'login', component: LoginStub },
    ],
  })
}

const stubService: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'route-1',
  name: 'Northbound Express',
  stops: [],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 },
  frequency_windows: [],
}

const stubScenario: Scenario = {
  id: 's1',
  slug: 'ca-hsr',
  name: 'CA HSR',
  description: 'California High-Speed Rail',
  service_ids: ['svc1'],
}

describe('AuthoringView', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(fetchMyServices).mockReset()
    vi.mocked(fetchMyScenarios).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function mountAuthoring() {
    const router = makeRouter()
    const auth = useAuthStore()
    auth.signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    await router.push('/authoring')
    const wrapper = mount(AuthoringView, { global: { plugins: [router] } })
    return { wrapper, router, auth }
  }

  it('shows who is signed in', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.text()).toContain('a@example.com')
  })

  it('links to the new-service authoring form', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    const link = wrapper.find('[data-testid="new-service-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/authoring/services/new')
  })

  it('lists my services once loaded', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([stubService])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.text()).toContain('Northbound Express')
  })

  it('lists my scenarios once loaded', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([stubScenario])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.text()).toContain('CA HSR')
  })

  it('shows an empty state when there are no services', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.find('[data-testid="services-empty"]').exists()).toBe(true)
  })

  it('shows an empty state when there are no scenarios', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenarios-empty"]').exists()).toBe(true)
  })

  it('shows an error state when fetching services fails, without blocking scenarios', async () => {
    vi.mocked(fetchMyServices).mockRejectedValue(new Error('boom'))
    vi.mocked(fetchMyScenarios).mockResolvedValue([stubScenario])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.find('[data-testid="services-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('CA HSR')
  })

  it('signs out and returns to /login', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response))
    const { wrapper, router, auth } = await mountAuthoring()
    await flushPromises()

    await wrapper.find('[data-testid="sign-out"]').trigger('click')
    await flushPromises()

    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
