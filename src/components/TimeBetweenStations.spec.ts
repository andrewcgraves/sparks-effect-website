import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TimeBetweenStations from './TimeBetweenStations.vue'
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

  it('heads the columns From, To and Run time', () => {
    const headers = mountSection([coastLine]).findAll('th').map((th) => th.text())
    expect(headers).toEqual(['From', 'To', 'Run time'])
  })

  it('renders one row per hop with endpoints and an m:ss run time', () => {
    const rows = mountSection([coastLine]).findAll('[data-testid="station-time-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('San Francisco')
    expect(rows[0].text()).toContain('San Jose')
    expect(rows[0].text()).toContain('30:00')
    expect(rows[1].text()).toContain('40:45')
  })

  it('heads each group with the name of the service it belongs to', () => {
    const wrapper = mountSection([coastLine])
    expect(wrapper.get('[data-testid="station-time-group-label"]').text()).toBe('Coast Line')
  })

  it('renders one group per service', () => {
    const second: StationTimeGroup = { ...coastLine, key: 'svc2', label: 'Valley Line' }
    const wrapper = mountSection([coastLine, second])
    expect(wrapper.findAll('[data-testid="station-time-group"]')).toHaveLength(2)
  })

  it('omits the group heading when the rows are not attributed to a service', () => {
    const wrapper = mountSection([{ ...coastLine, label: null }])
    expect(wrapper.find('[data-testid="station-time-group-label"]').exists()).toBe(false)
  })

  it('labels the direction toggle with the terminus each direction heads for', () => {
    const buttons = mountSection([coastLine]).findAll('[data-testid="direction-toggle"]')
    expect(buttons.map((b) => b.text())).toEqual(['To Fresno', 'To San Francisco'])
  })

  it('starts on the first direction, which the compiler emits in stop order', () => {
    const buttons = mountSection([coastLine]).findAll('[data-testid="direction-toggle"]')
    expect(buttons[0].attributes('aria-pressed')).toBe('true')
    expect(buttons[1].attributes('aria-pressed')).toBe('false')
  })

  it('shows the chosen direction\'s own hops and run times', async () => {
    const wrapper = mountSection([coastLine])
    await wrapper.findAll('[data-testid="direction-toggle"]')[1].trigger('click')
    const cells = wrapper.findAll('[data-testid="station-time-row"]').map((row) =>
      row.findAll('td').map((td) => td.text()),
    )
    // 41:00 is the return leg's own time, not the outbound 40:45 mirrored.
    expect(cells).toEqual([
      ['Fresno', 'San Jose', '41:00'],
      ['San Jose', 'San Francisco', '30:30'],
    ])
  })

  it('switches only the group whose toggle was used', async () => {
    const second: StationTimeGroup = { ...coastLine, key: 'svc2', label: 'Valley Line' }
    const wrapper = mountSection([coastLine, second])
    await wrapper.findAll('[data-testid="direction-toggle"]')[1].trigger('click')
    const groups = wrapper.findAll('[data-testid="station-time-group"]')
    expect(groups[0].findAll('[data-testid="station-time-row"]')[0].text()).toContain('Fresno')
    expect(groups[1].findAll('[data-testid="station-time-row"]')[0].text()).toContain('San Francisco')
  })

  it('offers no toggle for a service compiled in one direction', () => {
    const wrapper = mountSection([oneWay])
    expect(wrapper.find('[data-testid="direction-toggle"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="station-time-row"]')).toHaveLength(2)
  })

  it('shows muted loading copy instead of a table while run times are in flight', () => {
    const wrapper = mountSection([], true)
    expect(wrapper.get('[data-testid="station-times-loading"]').classes()).toContain('text-ink-muted')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('keeps the loading copy in place of stale groups', () => {
    const wrapper = mountSection([coastLine], true)
    expect(wrapper.find('[data-testid="station-time-group"]').exists()).toBe(false)
  })

  it('shows muted empty copy when the scenario has no run times', () => {
    const empty = mountSection([]).get('[data-testid="station-times-empty"]')
    expect(empty.text()).toBe('No run times for this scenario yet.')
    expect(empty.classes()).toContain('text-ink-muted')
  })

  it('shows no empty copy once there are groups to render', () => {
    expect(mountSection([coastLine]).find('[data-testid="station-times-empty"]').exists()).toBe(false)
  })
})
