import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ScenarioPreviewPanel from './ScenarioPreviewPanel.vue'
import { formatTimeRemaining, remainingSecsBySlug, buildTimeRemainingGraph } from './timeRemaining'
import type { ChainResponse } from '../fixtures/isochrone'
import type { Station } from '../api/scenarios'

vi.mock('../api/routingStatus', () => ({ fetchRoutingStatus: vi.fn() }))

import { fetchRoutingStatus } from '../api/routingStatus'

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
    async function mountWithStatus(status: 'ok' | 'degraded' | 'offline') {
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
})
