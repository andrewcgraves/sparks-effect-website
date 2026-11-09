import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import EmbedScenarioView from './EmbedScenarioView.vue'
import { testRouterAt } from '../test/router'
import { seriousA11yViolations } from '../test/axe'
import { staticIsochroneResponse } from '../test/sampleIsochrone'
import type { ScenarioDetail } from '../api/scenarios'
import type { PrerenderedIsochrone, PrerenderedIsochroneSummary } from '../api/prerenderedIsochrones'

vi.mock('../api/scenarios', () => ({ fetchScenario: vi.fn() }))
vi.mock('../api/isochrone', () => ({ fetchIsochrone: vi.fn() }))
vi.mock('../api/prerenderedIsochrones', () => ({
  listPrerenderedIsochrones: vi.fn(),
  fetchPrerenderedIsochrone: vi.fn(),
}))
vi.mock('../api/routingStatus', () => ({ fetchRoutingStatus: vi.fn() }))
vi.mock('../analytics/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../analytics/index')>()),
  trackEmbedLoad: vi.fn(),
}))

import { fetchScenario } from '../api/scenarios'
import { fetchIsochrone } from '../api/isochrone'
import { fetchPrerenderedIsochrone, listPrerenderedIsochrones } from '../api/prerenderedIsochrones'
import { fetchRoutingStatus } from '../api/routingStatus'
import { trackEmbedLoad } from '../analytics/index'

enableAutoUnmount(afterEach)

const SCENARIO: ScenarioDetail = {
  id: 's1',
  slug: 'ca-hsr',
  name: 'California High-Speed Rail',
  description: 'A line.',
  status: 'active',
  routes: [{
    id: 'r1',
    scenario_id: 's1',
    name: 'Main Line',
    mode: 'hsr',
    geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-121.9, 37.3]] },
    bidirectional: true,
  }],
  stations: [{
    id: 'st1',
    scenario_id: 's1',
    slug: 'sf',
    name: 'San Francisco',
    location: { type: 'Point', coordinates: [-122.4, 37.7] },
    platform_height: '0',
  }],
  services: [],
}

const PRESET: PrerenderedIsochroneSummary = {
  id: 'p1',
  label: 'SF Ferry Building - 180 min by transit',
  lat: 37.7955,
  lng: -122.3937,
  mode: 'transit',
  budget_mins: 180,
  created_at: '2026-09-01T00:00:00Z',
  outdated: false,
}

const PRESET_DETAIL: PrerenderedIsochrone = { ...PRESET, result: staticIsochroneResponse }

const PLOTTED = '?at=37.71,-122.41&mode=transit&mins=120'

async function mountAt(query = '', slug = 'ca-hsr') {
  const router = await testRouterAt(`/embed/scenario/${slug}${query}`)
  const wrapper = mount(EmbedScenarioView, {
    props: { slug },
    global: { plugins: [router], stubs: { MapView: true } },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

// v-show hides with an inline display: none somewhere up the tree.
function shown(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'], selector: string): boolean {
  const found = wrapper.find(selector)
  return found.exists() && !found.element.closest('[style*="display: none"]')
}

beforeEach(() => {
  vi.mocked(fetchScenario).mockReset().mockResolvedValue(SCENARIO)
  vi.mocked(fetchIsochrone).mockReset().mockResolvedValue(staticIsochroneResponse)
  vi.mocked(listPrerenderedIsochrones).mockReset().mockResolvedValue([PRESET])
  vi.mocked(fetchPrerenderedIsochrone).mockReset().mockResolvedValue(PRESET_DETAIL)
  vi.mocked(fetchRoutingStatus).mockReset().mockResolvedValue('ok')
  vi.mocked(trackEmbedLoad).mockClear()
})

describe('EmbedScenarioView, map only', () => {
  it('shows the map with no title, and a link to the full page asking the same question', async () => {
    const { wrapper } = await mountAt(PLOTTED)

    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(true)
    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(SCENARIO.name)
    const link = wrapper.get('[data-testid="embed-site-link"]')
    expect(link.attributes('href')).toBe(
      `${window.location.origin}/scenario/ca-hsr?at=37.71%2C-122.41&mode=transit&mins=120`,
    )
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
    expect(link.text()).toContain('sparks-effect.app')
  })

  it('plots the splash zone the URL names, once the line has loaded', async () => {
    await mountAt(PLOTTED)
    expect(fetchIsochrone).toHaveBeenCalledOnce()
    expect(fetchIsochrone).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 37.71, lng: -122.41, mode: 'transit', budget_mins: 120, scenario_slug: 'ca-hsr' }),
      expect.any(Function),
    )
  })

  it('offers no controls', async () => {
    const { wrapper } = await mountAt()
    expect(wrapper.find('[data-testid="plot-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="embed-plot-open"]').exists()).toBe(false)
  })

  it('offers the saved splash zones as one row of chips, drawn without a routing job', async () => {
    const { wrapper } = await mountAt()
    expect(shown(wrapper, '[data-testid="embed-examples"]')).toBe(true)
    expect(wrapper.get('[data-testid="embed-examples"] ul').classes()).toContain('overflow-x-auto')

    await wrapper.get('[data-testid="prerendered-entry"]').trigger('click')
    await flushPromises()

    expect(fetchIsochrone).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'MapView' }).props('isochroneData')).toEqual(staticIsochroneResponse)
    expect(shown(wrapper, '[data-testid="embed-examples"]')).toBe(false)
  })

  it('shows the line alone when the network has nothing saved', async () => {
    vi.mocked(listPrerenderedIsochrones).mockResolvedValue([])
    const { wrapper } = await mountAt()
    expect(shown(wrapper, '[data-testid="embed-examples"]')).toBe(false)
  })

  it('records the load once, with the page that framed it', async () => {
    await mountAt()
    expect(trackEmbedLoad).toHaveBeenCalledOnce()
    expect(trackEmbedLoad).toHaveBeenCalledWith(document.referrer)
  })

  it('has no serious or critical accessibility violations', async () => {
    const { wrapper } = await mountAt()
    expect(await seriousA11yViolations(wrapper.element)).toEqual([])
  })
})

describe('EmbedScenarioView, with controls', () => {
  it('opens the plot panel on the saved splash zones when nothing is plotted', async () => {
    const { wrapper } = await mountAt('?controls=1')
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(true)
    expect(shown(wrapper, '[data-testid="plot-saved"]')).toBe(true)
    expect(shown(wrapper, '[data-testid="plot-own"]')).toBe(false)
    expect(wrapper.find('[data-testid="embed-examples"]').exists()).toBe(false)
  })

  it('minimizes to a pill, and opens again from it', async () => {
    const { wrapper } = await mountAt('?controls=1')

    await wrapper.get('[data-testid="embed-plot-minimize"]').trigger('click')
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(false)
    expect(wrapper.get('[data-testid="embed-plot-open"]').text()).toBe('Plot a splash zone')

    await wrapper.get('[data-testid="embed-plot-open"]').trigger('click')
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(true)
  })

  it('starts minimized when the URL already names a plot', async () => {
    const { wrapper } = await mountAt(`${PLOTTED}&controls=1`)
    expect(fetchIsochrone).toHaveBeenCalledOnce()
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(false)
    expect(wrapper.get('[data-testid="embed-plot-open"]').text()).toBe('Plot another')
  })

  it('minimizes once a saved splash zone is chosen', async () => {
    const { wrapper } = await mountAt('?controls=1')
    await wrapper.get('[data-testid="prerendered-entry"]').trigger('click')
    await flushPromises()
    expect(fetchIsochrone).not.toHaveBeenCalled()
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(false)
    expect(wrapper.get('[data-testid="embed-plot-open"]').text()).toBe('Plot another')
  })

  it('gets out of the way of the map while a start is picked on it, and comes back after', async () => {
    const { wrapper } = await mountAt('?controls=1')
    await wrapper.get('[data-testid="plot-source-option-plot"]').setValue(true)

    await wrapper.get('[aria-label="Pick the starting point on the map"]').trigger('click')
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(false)
    expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(true)

    wrapper.findComponent({ name: 'MapView' }).vm.$emit('map-click', { lat: 37.71, lng: -122.41 })
    await flushPromises()
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(true)
  })

  it('plots a splash zone from the form, and minimizes once it is drawn', async () => {
    const { wrapper, router } = await mountAt('?controls=1')
    await wrapper.get('[data-testid="plot-source-option-plot"]').setValue(true)
    await wrapper.get('[aria-label="Pick the starting point on the map"]').trigger('click')
    wrapper.findComponent({ name: 'MapView' }).vm.$emit('map-click', { lat: 37.71, lng: -122.41 })
    await flushPromises()

    await wrapper.get('[data-testid="plot-panel"] form').trigger('submit')
    await flushPromises()

    expect(fetchIsochrone).toHaveBeenCalledOnce()
    expect(shown(wrapper, '[data-testid="plot-panel"]')).toBe(false)
    expect(router.currentRoute.value.query).toEqual(expect.objectContaining({ at: '37.71,-122.41', controls: '1' }))
  })
})

describe('EmbedScenarioView, not available', () => {
  it('says so in a card rather than a page, linking to the site in a new tab', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new Error('GET /api/scenarios/nope failed: 404'))
    const { wrapper } = await mountAt('', 'nope')

    const card = wrapper.get('[data-testid="embed-unavailable"]')
    expect(card.text()).toContain('This splash zone isn’t available.')
    expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(false)
    const home = card.get('a')
    expect(home.attributes('href')).toBe(`${window.location.origin}/`)
    expect(home.attributes('target')).toBe('_blank')
  })
})
