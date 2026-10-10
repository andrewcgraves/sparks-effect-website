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
import { seriousA11yViolations } from '../test/axe'
import { fetchMyServices } from '../api/authoring/services'
import { fetchMyScenarios } from '../api/authoring/scenarios'
import { useAuthStore } from '../stores/auth'
import { busyRegion, visibleText } from '../test/loading'

const LoginStub = { template: '<div>login</div>' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/authoring', name: 'authoring', component: AuthoringView },
      { path: '/authoring/services/:slug', name: 'service-detail', component: LoginStub },
      { path: '/authoring/scenarios/:slug', name: 'scenario-detail', component: LoginStub },
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

  it('names the user by their display name once they have one', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper, auth } = await mountAuthoring()
    auth.user = { id: 'u1', email: 'a@example.com', name: 'Ada' }
    await flushPromises()
    expect(wrapper.text()).toContain('Signed in as Ada')
  })

  it('leaves account and sign-out to the site header, and says where they are', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.find('a[href="/account"]').exists()).toBe(false)
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Sign out')
    expect(wrapper.get('[data-testid="account-menu-hint"]').text())
      .toBe('Account settings and sign out are in the menu at the top right.')
  })

  it.each([
    ['services', 'services-loading'],
    ['scenarios', 'scenarios-loading'],
  ])('shows skeleton cards for %s while they load, with no loading copy', async (_, testId) => {
    vi.mocked(fetchMyServices).mockReturnValue(new Promise(() => {}))
    vi.mocked(fetchMyScenarios).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountAuthoring()
    const region = busyRegion(wrapper, testId)
    expect(region.findAll('[data-testid="list-card-skeleton"]').length).toBeGreaterThan(0)
    expect(visibleText(region)).toBe('')
  })

  it('links back out to all lines', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.get('[data-testid="back-to-lines"]').attributes('href')).toBe('/')
  })

  it('links to the new-service authoring form', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([stubService])
    vi.mocked(fetchMyScenarios).mockResolvedValue([stubScenario])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    const link = wrapper.find('[data-testid="new-service-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/authoring/services/new')
  })

  it('links to the new-scenario builder', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([stubService])
    vi.mocked(fetchMyScenarios).mockResolvedValue([stubScenario])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    const link = wrapper.find('[data-testid="new-scenario-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/authoring/scenarios/new')
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

  it('shows each service slug and links to its detail page', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([stubService])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    const link = wrapper.find('[data-testid="service-link"]')
    expect(link.attributes('href')).toBe('/authoring/services/northbound-express')
    expect(link.text()).toContain('northbound-express')
  })

  it('shows each scenario slug and links to its detail page', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([stubScenario])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    const link = wrapper.find('[data-testid="scenario-link"]')
    expect(link.attributes('href')).toBe('/authoring/scenarios/ca-hsr')
    expect(link.text()).toContain('ca-hsr')
  })

  describe('with no lines and no networks', () => {
    async function mountEmpty() {
      vi.mocked(fetchMyServices).mockResolvedValue([])
      vi.mocked(fetchMyScenarios).mockResolvedValue([])
      const { wrapper } = await mountAuthoring()
      await flushPromises()
      return wrapper
    }

    it('shows one panel explaining a line and a network', async () => {
      const panel = (await mountEmpty()).get('[data-testid="authoring-empty"]')
      expect(panel.text()).toContain('Start by drawing a line')
      expect(panel.text()).toContain('stops along a route')
      expect(panel.text()).toContain('riders can change between them')
    })

    it('offers creating the first line as the only action', async () => {
      const wrapper = await mountEmpty()
      const panel = wrapper.get('[data-testid="authoring-empty"]')
      const links = panel.findAll('a')
      expect(links).toHaveLength(1)
      expect(links[0]!.text()).toBe('Create your first line')
      expect(links[0]!.attributes('href')).toBe('/authoring/services/new')
      expect(wrapper.find('[data-testid="new-service-link"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="new-scenario-link"]').exists()).toBe(false)
    })

    it('replaces the two per-list empty states', async () => {
      const wrapper = await mountEmpty()
      expect(wrapper.find('[data-testid="services-empty"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="scenarios-empty"]').exists()).toBe(false)
    })
  })

  it('does not claim there is nothing yet while one list is still loading', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.find('[data-testid="authoring-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="services-empty"]').exists()).toBe(true)
  })

  it('does not claim there is nothing yet when one list failed to load', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockRejectedValue(new Error('boom'))
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.find('[data-testid="authoring-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="scenarios-error"]').exists()).toBe(true)
  })

  it('invites combining lines into a network when there are lines but no networks', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([stubService])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    const empty = wrapper.get('[data-testid="scenarios-empty"]')
    expect(empty.text()).toContain('Combine your lines into a network so riders can change between them.')
    const link = empty.get('[data-testid="first-scenario-link"]')
    expect(link.attributes('href')).toBe('/authoring/scenarios/new')
  })

  it('does not invite combining lines it could not load', async () => {
    vi.mocked(fetchMyServices).mockRejectedValue(new Error('boom'))
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    const empty = wrapper.get('[data-testid="scenarios-empty"]')
    expect(empty.text()).toContain('A network combines lines so riders can change between them.')
    expect(empty.find('[data-testid="first-scenario-link"]').exists()).toBe(false)
  })

  it('explains a line in a sentence when there are networks but no lines', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([stubScenario])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.get('[data-testid="services-empty"]').text()).toContain('stops along a route')
  })

  it('shows an error state when fetching services fails, without blocking scenarios', async () => {
    vi.mocked(fetchMyServices).mockRejectedValue(new Error('boom'))
    vi.mocked(fetchMyScenarios).mockResolvedValue([stubScenario])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.find('[data-testid="services-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('CA HSR')
  })

  it('has no serious or critical accessibility violations once both lists load', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([stubService])
    vi.mocked(fetchMyScenarios).mockResolvedValue([stubScenario])
    const router = makeRouter()
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    await router.push('/authoring')
    const wrapper = mount(AuthoringView, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })
})
