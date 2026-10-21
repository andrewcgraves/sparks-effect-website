import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TimeBetweenStations from './TimeBetweenStations.vue'
import SkeletonShape from './SkeletonShape.vue'
import { busyRegion, visibleText } from '../test/loading'
import type { StationTimeGroup } from './stationTimes'

const coastLine: StationTimeGroup = {
  key: 'svc1',
  label: 'Coast Line',
  directions: [
    {
      terminus: 'Fresno',
      rows: [
        { from: 'San Francisco', to: 'San Jose', seconds: 1800 },
        { from: 'San Jose', to: 'Fresno', seconds: 2445 },
      ],
    },
    {
      terminus: 'San Francisco',
      rows: [
        { from: 'Fresno', to: 'San Jose', seconds: 2460 },
        { from: 'San Jose', to: 'San Francisco', seconds: 1830 },
      ],
    },
  ],
}

const oneWay: StationTimeGroup = {
  key: 'svc9',
  label: 'Shuttle',
  directions: [coastLine.directions[0]],
}

function mountSection(groups: StationTimeGroup[], loading = false) {
  return mount(TimeBetweenStations, { props: { groups, loading } })
}

describe('TimeBetweenStations', () => {
  it('titles the section "Time between stations"', () => {
    expect(mountSection([coastLine]).get('h2').text()).toBe('Time between stations')
  })

  it('names each station once, in stop order', () => {
    const stops = mountSection([coastLine]).findAll('[data-testid="station-time-stop"]')
    expect(stops.map((stop) => stop.get('[data-testid="station-time-stop-name"]').text())).toEqual([
      'San Francisco',
      'San Jose',
      'Fresno',
    ])
  })

  it('puts each hop\'s m:ss run time between the two stops it joins', () => {
    const hops = mountSection([coastLine]).findAll('[data-testid="station-time-hop"]')
    expect(hops.map((hop) => visibleText(hop).trim())).toEqual(['30:00', '40:45'])
  })

  it('tells a screen reader which stop each run time reaches', () => {
    const hop = mountSection([coastLine]).get('[data-testid="station-time-hop"]')
    expect(hop.get('.sr-only').text()).toBe('to San Jose, run time')
  })

  it('summarises the stop count and total run time beside the group name', () => {
    const summary = mountSection([coastLine]).get('[data-testid="station-time-group-summary"]')
    expect(summary.text()).toBe('3 stops · 1 h 11 min')
  })

  it('heads each group with the name of the service it belongs to', () => {
    const wrapper = mountSection([coastLine])
    expect(wrapper.get('[data-testid="station-time-group-label"]').text()).toBe('Coast Line')
  })

  it('renders one collapsible group per service with only the first open', () => {
    const second: StationTimeGroup = { ...coastLine, key: 'svc2', label: 'Valley Line' }
    const groups = mountSection([coastLine, second]).findAll('[data-testid="station-time-group"]')
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.element.tagName)).toEqual(['DETAILS', 'DETAILS'])
    expect(groups.map((g) => (g.element as HTMLDetailsElement).open)).toEqual([true, false])
  })

  it('names a group not attributed to a service after its end stations', () => {
    const wrapper = mountSection([{ ...coastLine, label: null }])
    expect(wrapper.get('[data-testid="station-time-group-label"]').text()).toBe('San Francisco – Fresno')
  })

  it('labels the direction toggle with the terminus each direction heads for', () => {
    const labels = mountSection([coastLine]).findAll('[data-testid="direction-toggle"] label')
    expect(labels.map((label) => label.text())).toEqual(['To Fresno', 'To San Francisco'])
  })

  it('starts on the first direction, which the compiler emits in stop order', () => {
    const wrapper = mountSection([coastLine])
    const checked = (index: number) =>
      (wrapper.get(`[data-testid="direction-toggle-option-${index}"]`).element as HTMLInputElement).checked
    expect([checked(0), checked(1)]).toEqual([true, false])
  })

  it('shows the chosen direction\'s own hops and run times', async () => {
    const wrapper = mountSection([coastLine])
    await wrapper.get('[data-testid="direction-toggle-option-1"]').setValue(true)
    const stops = wrapper.findAll('[data-testid="station-time-stop"]').map((stop) =>
      stop.get('[data-testid="station-time-stop-name"]').text(),
    )
    const hops = wrapper.findAll('[data-testid="station-time-hop"]').map((hop) => visibleText(hop).trim())
    expect(stops).toEqual(['Fresno', 'San Jose', 'San Francisco'])
    // 41:00 is the return leg's own time, not the outbound 40:45 mirrored.
    expect(hops).toEqual(['41:00', '30:30'])
    expect(wrapper.get('[data-testid="station-time-group-summary"]').text()).toBe('3 stops · 1 h 12 min')
  })

  it('switches only the group whose toggle was used', async () => {
    const second: StationTimeGroup = { ...coastLine, key: 'svc2', label: 'Valley Line' }
    const wrapper = mountSection([coastLine, second])
    await wrapper.get('[data-testid="direction-toggle-option-1"]').setValue(true)
    const groups = wrapper.findAll('[data-testid="station-time-group"]')
    expect(groups[0].findAll('[data-testid="station-time-stop"]')[0].text()).toContain('Fresno')
    expect(groups[1].findAll('[data-testid="station-time-stop"]')[0].text()).toContain('San Francisco')
  })

  it('offers no toggle for a service compiled in one direction', () => {
    const wrapper = mountSection([oneWay])
    expect(wrapper.find('[data-testid="direction-toggle"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="station-time-hop"]')).toHaveLength(2)
  })

  it('shows skeleton rows instead of the stop list while run times are in flight', () => {
    const wrapper = mountSection([], true)
    const region = busyRegion(wrapper, 'station-times-loading')
    expect(region.findAllComponents(SkeletonShape).length).toBeGreaterThan(0)
    expect(visibleText(region)).toBe('')
    expect(wrapper.find('[data-testid="station-time-stops"]').exists()).toBe(false)
  })

  it('keeps its heading while loading so the card does not change shape', () => {
    expect(mountSection([], true).get('h2').text()).toBe('Time between stations')
  })

  it('keeps the skeleton in place of stale groups', () => {
    const wrapper = mountSection([coastLine], true)
    expect(wrapper.find('[data-testid="station-time-group"]').exists()).toBe(false)
  })

  it('shows muted empty copy when the scenario has no run times', () => {
    const empty = mountSection([]).get('[data-testid="station-times-empty"]')
    expect(empty.text()).toBe('No run times yet.')
    expect(empty.classes()).toContain('text-ink-muted')
  })

  it('shows no empty copy once there are groups to render', () => {
    expect(mountSection([coastLine]).find('[data-testid="station-times-empty"]').exists()).toBe(false)
  })
})
