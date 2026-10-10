import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ScenarioPreviewPanel from './ScenarioPreviewPanel.vue'
import { formatTimeRemaining, remainingSecsBySlug, buildTimeRemainingGraph } from './timeRemaining'
import type { ChainResponse } from '../fixtures/isochrone'
import type { Station } from '../api/scenarios'
import type { NearMiss } from '../api/authoring/types'

vi.mock('../api/routingStatus', () => ({ fetchRoutingStatus: vi.fn() }))

import { fetchRoutingStatus, type RoutingStatus } from '../api/routingStatus'

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.mocked(fetchRoutingStatus).mockReset().mockResolvedValue('ok')
})

const defaultProps = {
  origin: null,
  isochroneData: null,
  loading: false,
  error: null,
  nearMisses: [],
  realisedClusters: [],
  services: [],
}

function mountPanel(stubs: Record<string, boolean> = { MapView: true, IsochroneForm: true }) {
  return mount(ScenarioPreviewPanel, { props: defaultProps, global: { stubs } })
}

const stations: Station[] = [
  {
    id: 'st1',
    scenario_id: 's1',
    slug: 'sf',
    name: 'San Francisco',
    location: { type: 'Point', coordinates: [-122.4, 37.7] },
    platform_height: '0',
  },
]
const isochroneData: ChainResponse = {
  type: 'FeatureCollection',
  features: [],
  metadata: {
    reachable_stations: [
      { station_slug: 'sf', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
    ],
    origin_budget_mins: 120,
    compile_job_id: 'compile-1',
    mode: 'walk',
    wait_model: 'headway_over_2_peak',
    origin_iso_available: true,
  },
}

describe('ScenarioPreviewPanel', () => {
  describe('picking the origin on the map', () => {
    it('arms MapView with an origin cue when IsochroneForm emits pick-armed', async () => {
      const wrapper = mountPanel()
      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(false)

      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('pick-armed', true)

      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(true)
      expect(wrapper.findComponent({ name: 'MapView' }).props('placementCue')).toBe('Click the map to set origin — Esc to cancel')
    })

    it('disarms MapView when IsochroneForm reports the pick is over', async () => {
      const wrapper = mountPanel()
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('pick-armed', true)
      await wrapper.findComponent({ name: 'IsochroneForm' }).vm.$emit('pick-armed', false)

      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(false)
    })

    it('feeds a map click back into the form as the origin', async () => {
      const wrapper = mountPanel({ MapView: true })
      await wrapper.find('[data-testid="pick-on-map"]').trigger('click')

      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('map-click', { lat: 45.5231, lng: -122.6784 })

      expect((wrapper.find('input[data-testid="lat"]').element as HTMLInputElement).value).toBe('45.5231')
      expect((wrapper.find('input[data-testid="lng"]').element as HTMLInputElement).value).toBe('-122.6784')
      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(false)
    })

    it('reports the picked origin upward, so the page can pass it back as the marker', async () => {
      const wrapper = mountPanel({ MapView: true })
      await wrapper.find('[data-testid="pick-on-map"]').trigger('click')

      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('map-click', { lat: 45.5231, lng: -122.6784 })

      const emissions = wrapper.emitted<[{ lat: number; lng: number } | null]>('origin-change')!
      expect(emissions[emissions.length - 1][0]).toEqual({ lat: 45.5231, lng: -122.6784 })
    })
  })

  it('hands MapView the same remaining lookup a plot would give the card', () => {
    const wrapper = mount(ScenarioPreviewPanel, {
      props: { ...defaultProps, isochroneData, mapStations: stations },
      global: { stubs: { MapView: true, IsochroneForm: true } },
    })
    const remainingSecs = wrapper.findComponent({ name: 'MapView' }).props('remainingSecs') as
      (slug: string) => number | null
    const expected = remainingSecsBySlug(buildTimeRemainingGraph(isochroneData.metadata, {
      stationName: (slug) => stations.find((station) => station.slug === slug)?.name ?? slug,
      serviceName: (id) => id,
      mode: 'walk',
    }))

    expect(remainingSecs('sf')).toBe(expected('sf'))
    expect(formatTimeRemaining(remainingSecs('sf')!)).toBe('1h 55m')
    expect(remainingSecs('nowhere')).toBeNull()
  })

  describe('the time-remaining graph', () => {
    function mountWithPlot(plot: ChainResponse | null) {
      return mount(ScenarioPreviewPanel, {
        props: { ...defaultProps, isochroneData: plot, mapStations: stations },
        global: { stubs: { MapView: true, IsochroneForm: true } },
      })
    }

    it('draws the graph for a plot that reached a station', () => {
      const wrapper = mountWithPlot(isochroneData)
      const graph = wrapper.findComponent({ name: 'TimeRemaining' })
      expect(graph.exists()).toBe(true)
      expect(graph.text()).toContain('San Francisco')
    })

    it('draws nothing before there is a plot', () => {
      expect(mountWithPlot(null).findComponent({ name: 'TimeRemaining' }).exists()).toBe(false)
    })

    it('opens the row for a station hovered on the map', async () => {
      const wrapper = mountWithPlot(isochroneData)
      await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sf')

      const graph = wrapper.findComponent({ name: 'TimeRemaining' })
      expect(graph.props('activeSlug')).toBe('sf')
      expect(graph.props('activeFromMap')).toBe(true)
    })

    it('marks on the map the station activated in the graph', async () => {
      const wrapper = mountWithPlot(isochroneData)
      await wrapper.findComponent({ name: 'TimeRemaining' }).vm.$emit('activate', 'sf')

      expect(wrapper.findComponent({ name: 'MapView' }).props('activeStation')).toBe('sf')
    })
  })

  describe('when live routing is down', () => {
    async function mountWithStatus(status: RoutingStatus) {
      vi.mocked(fetchRoutingStatus).mockResolvedValue(status)
      const wrapper = mount(ScenarioPreviewPanel, {
        props: { ...defaultProps, initial: { lat: 37.7, lng: -122.4 } },
        global: { stubs: { MapView: true } },
      })
      await flushPromises()
      return wrapper
    }

    function plotButton(wrapper: Awaited<ReturnType<typeof mountWithStatus>>) {
      return wrapper.find('button[type="submit"]').element as HTMLButtonElement
    }

    it('says so, and disables Plot with the reason, when routing is offline', async () => {
      const wrapper = await mountWithStatus('offline')

      const banner = wrapper.find('[data-testid="routing-status"]')
      expect(banner.text()).toContain('Live routing is offline right now.')
      expect(banner.text()).not.toContain('saved examples')
      expect(plotButton(wrapper).disabled).toBe(true)
      expect(wrapper.find('[data-testid="plot-reason"]').attributes('title')).toContain('offline')
    })

    it('warns that plotting may be slow, but still lets the visitor plot, when routing is degraded', async () => {
      const wrapper = await mountWithStatus('degraded')

      expect(wrapper.find('[data-testid="routing-status"]').text()).toContain('may be slow')
      expect(plotButton(wrapper).disabled).toBe(false)
    })

    it('shows nothing extra when routing is ok', async () => {
      const wrapper = await mountWithStatus('ok')

      expect(wrapper.find('[data-testid="routing-status"]').exists()).toBe(false)
      expect(plotButton(wrapper).disabled).toBe(false)
    })
  })

  describe('near misses', () => {
    const nearMiss: NearMiss = {
      a: { service_id: 'svc1', slug: 'union', name: 'Union' },
      b: { service_id: 'svc2', slug: 'midtown', name: 'Midtown' },
      distance_m: 120.4,
    }

    function mountWithNearMiss(extra: Record<string, unknown> = {}) {
      return mount(ScenarioPreviewPanel, {
        props: { ...defaultProps, nearMisses: [nearMiss], ...extra },
        global: { stubs: { MapView: true, IsochroneForm: true } },
      })
    }

    it('only reports them on a page that does not pass its declared pairs', () => {
      const wrapper = mountWithNearMiss()
      expect(wrapper.get('[data-testid="near-miss-row"]').text()).toContain('120 m apart')
      expect(wrapper.find('[data-testid="join-interchange"]').exists()).toBe(false)
    })

    it('offers Join as interchange beside each, and hands the near miss up', async () => {
      const wrapper = mountWithNearMiss({ interchangePairs: [] })
      const button = wrapper.get('[data-testid="join-interchange"]')
      expect(button.text()).toBe('Join as interchange')

      await button.trigger('click')
      expect(wrapper.emitted('join')).toEqual([[nearMiss]])
    })

    it('holds Join while the page is busy saving or compiling', () => {
      const wrapper = mountWithNearMiss({ interchangePairs: [], interchangeBusy: true })
      expect(wrapper.get('[data-testid="join-interchange"]').attributes('disabled')).toBeDefined()
    })

    it('names the pair it would join for assistive technology', () => {
      const wrapper = mountWithNearMiss({ interchangePairs: [] })
      expect(wrapper.get('[data-testid="join-interchange"]').attributes('aria-label'))
        .toBe('Join Union and Midtown as an interchange')
    })

    // Declared but still a near miss: the graph shown predates the pair, or
    // the recompile that would realise it failed.
    it('says a pair declared either way round is not in the compiled network yet, and offers Recompile instead of Join', async () => {
      const wrapper = mountWithNearMiss({
        interchangePairs: [{ a: { service_id: 'svc2', slug: 'midtown' }, b: { service_id: 'svc1', slug: 'union' } }],
      })
      expect(wrapper.find('[data-testid="join-interchange"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Joined')
      expect(wrapper.get('[data-testid="near-miss-declared"]').text()).toBe('Declared — not in the compiled network yet')

      await wrapper.get('[data-testid="recompile-interchange"]').trigger('click')
      expect(wrapper.emitted('recompile')).toEqual([[]])
    })

    it('holds Recompile while the page is busy saving or compiling', () => {
      const wrapper = mountWithNearMiss({
        interchangePairs: [{ a: { service_id: 'svc1', slug: 'union' }, b: { service_id: 'svc2', slug: 'midtown' } }],
        interchangeBusy: true,
      })
      expect(wrapper.get('[data-testid="recompile-interchange"]').attributes('disabled')).toBeDefined()
    })

    it('will not join a near miss naming a stop no longer in this network, and says why', async () => {
      const wrapper = mountWithNearMiss({
        interchangePairs: [],
        stopMissing: (stop: { slug: string }) => stop.slug === 'midtown',
      })
      const button = wrapper.get('[data-testid="join-interchange"]')
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.attributes('title')).toBe('Stop no longer in this network')
      expect(wrapper.get('[data-testid="near-miss-gone"]').text()).toBe('A stop is no longer in this network')
      await button.trigger('click')
      expect(wrapper.emitted('join')).toBeUndefined()
    })
  })

  // SPA-429: a host page that gives the screen to the map asks for the phone
  // layout; the panel itself does not read the window, so the authored detail
  // pages — desktop pages for launch — keep the stacked layout at any width.
  describe('on a phone', () => {
    const nearMiss: NearMiss = {
      a: { service_id: 'svc-1', slug: 'union', name: 'Union' },
      b: { service_id: 'svc-2', slug: 'union-square', name: 'Union Square' },
      distance_m: 140,
    }

    function mountPhone(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
      return mount(ScenarioPreviewPanel, {
        props: { ...defaultProps, phone: true, title: 'Northbound Express', ...props },
        slots,
        global: { stubs: { MapView: true } },
      })
    }

    function tabNamed(wrapper: ReturnType<typeof mountPhone>, label: string) {
      return wrapper.findAll('[role="tab"]').find((tab) => tab.text() === label)
    }

    function tabLabels(wrapper: ReturnType<typeof mountPhone>) {
      return wrapper.findAll('[role="tab"]').map((tab) => tab.text())
    }

    it('shows the map with the plot form and results in a tabbed panel, titled by the host', () => {
      const wrapper = mountPhone()
      expect(wrapper.find('[data-testid="phone-map-page"]').exists()).toBe(true)
      expect(wrapper.get('h1').text()).toBe('Northbound Express')
      expect(tabLabels(wrapper)).toEqual(['Plot', 'Results'])
      expect(wrapper.find('form').exists()).toBe(true)
      expect(tabNamed(wrapper, 'Results')!.attributes('disabled')).toBeDefined()
    })

    it('stays stacked unless the host asks for the phone layout', () => {
      window.innerWidth = 390
      try {
        expect(mountPanel({ MapView: true }).find('[data-testid="phone-map-page"]').exists()).toBe(false)
      } finally {
        window.innerWidth = 1024
      }
    })

    it('turns to Results once a splash zone is plotted', async () => {
      const wrapper = mountPhone({ mapStations: stations })
      await wrapper.setProps({ isochroneData })

      expect(tabNamed(wrapper, 'Results')!.attributes('aria-selected')).toBe('true')
      const card = wrapper.get('[data-testid="time-remaining"]')
      expect(card.text()).toContain('San Francisco')
      expect((card.element.closest('[role="tabpanel"]') as HTMLElement).style.display).not.toBe('none')
    })

    // A refused plot clears the splash zone and says why in the form, so a
    // panel left on an empty Results tab would hide the explanation.
    it('returns to Plot when the splash zone is cleared', async () => {
      const wrapper = mountPhone({ mapStations: stations })
      await wrapper.setProps({ isochroneData })
      expect(tabNamed(wrapper, 'Results')!.attributes('aria-selected')).toBe('true')

      await wrapper.setProps({ isochroneData: null })

      expect(tabNamed(wrapper, 'Plot')!.attributes('aria-selected')).toBe('true')
      expect(tabNamed(wrapper, 'Results')!.attributes('disabled')).toBeDefined()
    })

    it('adds an Interchanges tab when stops did not connect', async () => {
      const wrapper = mountPhone({ nearMisses: [nearMiss], services: [{ id: 'svc-1', name: 'Red' }, { id: 'svc-2', name: 'Blue' }] })
      expect(tabLabels(wrapper)).toEqual(['Plot', 'Results', 'Interchanges'])

      await tabNamed(wrapper, 'Interchanges')!.trigger('click')

      const list = wrapper.get('[data-testid="near-miss-list"]')
      expect(list.text()).toContain('Union (Red) and Union Square (Blue)')
      expect((list.element.closest('[role="tabpanel"]') as HTMLElement).style.display).not.toBe('none')
    })

    it("adds the host's tabs after its own, filled from the host's slots", async () => {
      const wrapper = mountPhone(
        { phoneTabs: [{ key: 'stops', label: 'Stops' }] },
        { 'phone-stops': '<ol data-testid="host-stops"><li>Union</li></ol>' },
      )
      expect(tabLabels(wrapper)).toEqual(['Plot', 'Results', 'Stops'])

      await tabNamed(wrapper, 'Stops')!.trigger('click')

      const stops = wrapper.get('[data-testid="host-stops"]')
      expect((stops.element.closest('[role="tabpanel"]') as HTMLElement).style.display).not.toBe('none')
    })

    it('gives the map room while the visitor picks an origin on it', async () => {
      const wrapper = mountPhone()
      await wrapper.find('[data-testid="pick-on-map"]').trigger('click')

      expect(wrapper.findComponent({ name: 'MapView' }).props('placementArmed')).toBe(true)
      expect(wrapper.get('[data-testid="phone-panel-toggle"]').attributes('aria-expanded')).toBe('false')
    })
  })
})
