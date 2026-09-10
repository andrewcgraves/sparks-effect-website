import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ScenarioPreviewPanel from './ScenarioPreviewPanel.vue'
import { formatTimeRemaining, remainingSecsBySlug, buildTimeRemainingGraph } from './timeRemaining'
import type { ChainResponse } from '../fixtures/isochrone'
import type { Station } from '../api/scenarios'

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
})
