import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EmbedServiceView from './EmbedServiceView.vue'
import { testRouterAt } from '../test/router'
import { seriousA11yViolations } from '../test/axe'
import { staticIsochroneResponse } from '../test/sampleIsochrone'
import { ApiError } from '../api/authoring/client'
import type { ServicePublication } from '../api/publications'

vi.mock('../api/publications', () => ({
  fetchServicePublication: vi.fn(),
  fetchPublicationIsochrone: vi.fn(),
}))
vi.mock('../api/routingStatus', () => ({ fetchRoutingStatus: vi.fn() }))
vi.mock('../analytics/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../analytics/index')>()),
  trackEmbedLoad: vi.fn(),
}))

import { fetchPublicationIsochrone, fetchServicePublication } from '../api/publications'
import { fetchRoutingStatus } from '../api/routingStatus'
import { trackEmbedLoad } from '../analytics/index'
import { defineComponent, h } from 'vue'
import MapView from '../components/MapView.vue'

// Keeps MapView's name and props for findComponent, and renders the credit
// slot the embed puts its way back to the site in.
const MapViewStub = defineComponent({
  name: 'MapView',
  props: MapView.props,
  setup: (_, { slots }) => () => h('div', slots.attribution?.()),
})

enableAutoUnmount(afterEach)

const PUBLICATION: ServicePublication = {
  user_service_id: 'svc1',
  compile_job_id: 'job1',
  name: 'Northbound Express',
  published_at: '2026-09-27T12:00:00Z',
  services: [{ service_id: 'svc1', wait_secs: 0, edges: [{ from_slug: 'a', to_slug: 'b', seconds: 60 }] }],
  nodes: [
    { slug: 'a', lat: 37.7, lng: -122.4, names: ['Union'] },
    { slug: 'b', lat: 37.5, lng: -122.1, names: ['Midtown'] },
  ],
  routes: [{
    id: 'route-1', slug: 'main-line', name: 'Main Line', mode: 'rail', bidirectional: true,
    geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-122.1, 37.5]] }, segments: [],
  }],
}

const PLOTTED = '?at=37.71,-122.41&mode=transit&mins=120'

async function mountAt(query = '', slug = 'northbound-express') {
  const router = await testRouterAt(`/embed/services/${slug}${query}`)
  const wrapper = mount(EmbedServiceView, {
    props: { slug },
    global: { plugins: [router], stubs: { MapView: MapViewStub } },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

function shown(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'], selector: string): boolean {
  const found = wrapper.find(selector)
  return found.exists() && !found.element.closest('[style*="display: none"]')
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(fetchServicePublication).mockReset().mockResolvedValue(PUBLICATION)
  vi.mocked(fetchPublicationIsochrone).mockReset().mockResolvedValue(staticIsochroneResponse)
  vi.mocked(fetchRoutingStatus).mockReset().mockResolvedValue('ok')
  vi.mocked(trackEmbedLoad).mockClear()
})

describe('EmbedServiceView, map only', () => {
  it('shows the line with no title, and a link to the full page asking the same question', async () => {
    const { wrapper } = await mountAt(PLOTTED)

    const map = wrapper.findComponent({ name: 'MapView' })
    expect(map.props('routes')).toHaveLength(1)
    expect(wrapper.text()).not.toContain(PUBLICATION.name)
    const link = wrapper.get('[data-testid="embed-site-link"]')
    expect(link.attributes('href')).toBe(
      `${window.location.origin}/services/northbound-express?at=37.71%2C-122.41&mode=transit&mins=120`,
    )
    expect(link.attributes('target')).toBe('_blank')
  })

  it('plots the splash zone the URL names, once the publication has loaded', async () => {
    await mountAt(PLOTTED)
    expect(fetchPublicationIsochrone).toHaveBeenCalledOnce()
    expect(fetchPublicationIsochrone).toHaveBeenCalledWith(
      'northbound-express',
      { lat: 37.71, lng: -122.41, mode: 'transit', budget_mins: 120 },
      expect.any(Function),
    )
  })

  it('shows the line alone, with no controls and nothing saved to offer', async () => {
    const { wrapper } = await mountAt()
    expect(fetchPublicationIsochrone).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="plot-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="embed-examples"]').exists()).toBe(false)
  })

  it('records the load once', async () => {
    await mountAt()
    expect(trackEmbedLoad).toHaveBeenCalledOnce()
  })

  it('has no serious or critical accessibility violations', async () => {
    const { wrapper } = await mountAt()
    expect(await seriousA11yViolations(wrapper.element)).toEqual([])
  })
})

describe('EmbedServiceView, with controls', () => {
  it('opens on the form, there being no saved splash zones, and minimizes after a plot', async () => {
    const { wrapper } = await mountAt('?controls=1')
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(true)
    expect(shown(wrapper, '[data-testid="plot-own"]')).toBe(true)

    await wrapper.get('[aria-label="Pick the starting point on the map"]').trigger('click')
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(false)
    wrapper.findComponent({ name: 'MapView' }).vm.$emit('map-click', { lat: 37.71, lng: -122.41 })
    await flushPromises()
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(true)

    await wrapper.get('[data-testid="plot-panel"] form').trigger('submit')
    await flushPromises()
    expect(fetchPublicationIsochrone).toHaveBeenCalledOnce()
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(false)
    expect(wrapper.get('[data-testid="embed-plot-open"]').text()).toBe('Plot another')
  })
})

describe('EmbedServiceView, not available', () => {
  // Unpublished and unknown are one 404 from the API, and one card here, with
  // the same words as an unknown network's.
  it('says so in the same card as a missing network', async () => {
    vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('GET failed: 404', 404))
    const { wrapper } = await mountAt('', 'a-draft')
    expect(wrapper.get('[data-testid="embed-unavailable"]').text()).toContain('This splash zone isn’t available.')
    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(false)
  })
})
