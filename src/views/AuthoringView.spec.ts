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
vi.mock('../api/authoring/handovers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/authoring/handovers')>()),
  fetchMyHandovers: vi.fn(),
  acceptHandover: vi.fn(),
  declineHandover: vi.fn(),
}))

import AuthoringView from './AuthoringView.vue'
import { seriousA11yViolations } from '../test/axe'
import { fetchMyServices } from '../api/authoring/services'
import { fetchMyScenarios } from '../api/authoring/scenarios'
import {
  acceptHandover,
  declineHandover,
  fetchMyHandovers,
  type IncomingHandover,
  type MyHandovers,
  type OutgoingHandover,
} from '../api/authoring/handovers'
import { ApiError } from '../api/authoring/client'
import { mountSharedHosts } from '../test/sharedHosts'
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
    vi.mocked(fetchMyHandovers).mockReset().mockResolvedValue({ incoming: [], outgoing: [] })
    vi.mocked(acceptHandover).mockReset()
    vi.mocked(declineHandover).mockReset()
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

  it('leaves account and sign-out to the site header', async () => {
    vi.mocked(fetchMyServices).mockResolvedValue([])
    vi.mocked(fetchMyScenarios).mockResolvedValue([])
    const { wrapper } = await mountAuthoring()
    await flushPromises()
    expect(wrapper.find('a[href="/account"]').exists()).toBe(false)
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Sign out')
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

  describe('transfers', () => {
    let hosts: ReturnType<typeof mountSharedHosts>

    const offered: IncomingHandover = {
      id: 'h-in',
      service_slug: 'coast-line',
      service_name: 'Coast Line',
      from_name: 'Grace',
      status: 'pending',
      created_at: '2026-10-01T12:00:00Z',
      expires_at: '2026-10-15T12:00:00Z',
    }

    const coastLine: Service = { ...stubService, id: 'svc2', slug: 'coast-line', name: 'Coast Line' }

    const sent: OutgoingHandover = {
      id: 'h-out',
      service_slug: 'northbound-express',
      service_name: 'Northbound Express',
      to_name: 'Ada',
      status: 'pending',
      created_at: '2026-10-01T12:00:00Z',
      expires_at: '2026-10-15T12:00:00Z',
    }

    function withHandovers(mine: Partial<MyHandovers>): void {
      vi.mocked(fetchMyHandovers).mockResolvedValue({ incoming: [], outgoing: [], ...mine })
    }

    beforeEach(() => {
      vi.mocked(fetchMyServices).mockResolvedValue([stubService])
      vi.mocked(fetchMyScenarios).mockResolvedValue([])
      hosts = mountSharedHosts()
    })

    afterEach(() => {
      hosts.unmount()
    })

    it('shows no transfers banner when nothing is offered to the user', async () => {
      const { wrapper } = await mountAuthoring()
      await flushPromises()
      expect(wrapper.find('[data-testid="incoming-handovers"]').exists()).toBe(false)
    })

    it('lists each incoming offer with the line, who sent it and when it expires', async () => {
      withHandovers({ incoming: [offered] })
      const { wrapper } = await mountAuthoring()
      await flushPromises()
      const banner = wrapper.get('[data-testid="incoming-handovers"]')
      expect(banner.get('h2').text()).toBe('Incoming transfers')
      const row = banner.get('[data-testid="incoming-handover"]')
      expect(row.text()).toContain('Coast Line')
      expect(row.text()).toContain('From Grace')
      expect(row.text()).toMatch(/expires .*2026/i)
      expect(row.get('[data-testid="accept-handover"]').text()).toBe('Accept')
      expect(row.get('[data-testid="decline-handover"]').text()).toBe('Decline')
    })

    it('still shows an incoming offer to someone with no lines of their own', async () => {
      vi.mocked(fetchMyServices).mockResolvedValue([])
      withHandovers({ incoming: [offered] })
      const { wrapper } = await mountAuthoring()
      await flushPromises()
      expect(wrapper.find('[data-testid="incoming-handover"]').exists()).toBe(true)
    })

    it('accepts an offer, after which the line is in the user\'s list and the offer is gone', async () => {
      withHandovers({ incoming: [offered] })
      vi.mocked(acceptHandover).mockResolvedValue({ ...offered, status: 'accepted' })
      const { wrapper } = await mountAuthoring()
      await flushPromises()
      withHandovers({})
      vi.mocked(fetchMyServices).mockResolvedValue([stubService, coastLine])

      await wrapper.get('[data-testid="accept-handover"]').trigger('click')
      await flushPromises()

      expect(acceptHandover).toHaveBeenCalledWith('h-in')
      expect(hosts.toasts()).toEqual(['Transfer accepted'])
      expect(wrapper.find('[data-testid="incoming-handovers"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="service-link"]').map((link) => link.attributes('href')))
        .toContain('/authoring/services/coast-line')
    })

    it('explains, naming the networks, when the sender still has the line in them', async () => {
      withHandovers({ incoming: [offered] })
      vi.mocked(acceptHandover).mockRejectedValue(
        new ApiError('conflict', 409, 'service_in_scenarios', { scenarios: ['bay-loop', 'peninsula'] }),
      )
      const { wrapper } = await mountAuthoring()
      await flushPromises()

      await wrapper.get('[data-testid="accept-handover"]').trigger('click')
      await flushPromises()

      const refusal = wrapper.get('[data-testid="handover-refusal"]')
      expect(refusal.text()).toBe('Grace has to take this line out of their networks first: bay-loop, peninsula.')
      expect(refusal.attributes('role')).toBe('alert')
      expect(hosts.toasts()).toEqual([])
    })

    it('explains the scenario refusal even when it names no networks', async () => {
      withHandovers({ incoming: [offered] })
      vi.mocked(acceptHandover).mockRejectedValue(new ApiError('conflict', 409, 'service_in_scenarios'))
      const { wrapper } = await mountAuthoring()
      await flushPromises()

      await wrapper.get('[data-testid="accept-handover"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-testid="handover-refusal"]').text())
        .toBe('Grace has to take this line out of their networks before you can accept it.')
    })

    it('says so, and drops the row, when the offer closed before it was accepted', async () => {
      withHandovers({ incoming: [offered] })
      vi.mocked(acceptHandover).mockRejectedValue(new ApiError('handover is no longer pending', 409))
      const { wrapper } = await mountAuthoring()
      await flushPromises()
      withHandovers({})

      await wrapper.get('[data-testid="accept-handover"]').trigger('click')
      await flushPromises()

      expect(hosts.toasts()).toEqual(['That offer is no longer open.'])
      expect(wrapper.find('[data-testid="incoming-handover"]').exists()).toBe(false)
    })

    it('asks before declining, and keeps the offer when backed out of', async () => {
      withHandovers({ incoming: [offered] })
      const { wrapper } = await mountAuthoring()
      await flushPromises()

      await wrapper.get('[data-testid="decline-handover"]').trigger('click')
      await flushPromises()
      expect(hosts.dialog().text()).toContain("Decline 'Coast Line'?")
      await hosts.cancelButton().trigger('click')
      await flushPromises()

      expect(declineHandover).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="incoming-handover"]').exists()).toBe(true)
    })

    it('declines once confirmed, and the offer goes', async () => {
      withHandovers({ incoming: [offered] })
      vi.mocked(declineHandover).mockResolvedValue({ ...offered, status: 'declined' })
      const { wrapper } = await mountAuthoring()
      await flushPromises()
      withHandovers({})

      await wrapper.get('[data-testid="decline-handover"]').trigger('click')
      await flushPromises()
      await hosts.confirmButton().trigger('click')
      await flushPromises()

      expect(declineHandover).toHaveBeenCalledWith('h-in')
      expect(hosts.toasts()).toEqual(['Transfer declined'])
      expect(wrapper.find('[data-testid="incoming-handovers"]').exists()).toBe(false)
    })

    it('badges a line the user has offered to someone as transfer pending', async () => {
      withHandovers({ outgoing: [sent] })
      const { wrapper } = await mountAuthoring()
      await flushPromises()
      const link = wrapper.get('[data-testid="service-link"]')
      expect(link.get('[data-testid="handover-pending"]').text()).toBe('Transfer pending')
    })

    it('does not badge a line with no pending offer', async () => {
      const { wrapper } = await mountAuthoring()
      await flushPromises()
      expect(wrapper.find('[data-testid="handover-pending"]').exists()).toBe(false)
    })

    it('has no serious or critical accessibility violations with an incoming offer and a badge', async () => {
      withHandovers({ incoming: [offered], outgoing: [sent] })
      const router = makeRouter()
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
      await router.push('/authoring')
      const wrapper = mount(AuthoringView, { global: { plugins: [router] }, attachTo: document.body })
      await flushPromises()
      expect(await seriousA11yViolations(wrapper)).toEqual([])
      wrapper.unmount()
    })
  })
})
