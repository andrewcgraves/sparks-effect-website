import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, ref, type PropType, type Ref } from 'vue'
import TimeRemaining from './TimeRemaining.vue'
import { buildTimeRemainingGraph, lineByRoute } from './timeRemaining'
import type { Route, Service, Station } from '../api/scenarios'
import type { ChainResponse } from '../fixtures/isochrone'
import { UNNAMED_LINE, UNNAMED_STATION } from '../copy/names'
import { PHONE_PANEL_SCROLLER } from './phonePanelScroll'

// These cases drove the card through the network page until SPA-504 gave that
// page one Stations card. The card still serves the line pages, so it is driven
// here the way a page drives it: built from a chain, wired to a map that hands
// hovers back.

const stubStations: Station[] = [
  {
    id: 'st1',
    scenario_id: 's1',
    slug: 'sf',
    name: 'San Francisco',
    location: { type: 'Point', coordinates: [-122.4, 37.7] },
    platform_height: '0',
  },
  {
    id: 'st2',
    scenario_id: 's1',
    slug: 'sj',
    name: 'San Jose',
    location: { type: 'Point', coordinates: [-121.9, 37.3] },
    platform_height: '0',
  },
  {
    id: 'st3',
    scenario_id: 's1',
    slug: 'gilroy',
    name: 'Gilroy',
    location: { type: 'Point', coordinates: [-121.57, 37.0] },
    platform_height: '0',
  },
]

interface Network {
  // The page-only fields the moved cases still set (name, description) pass unread.
  [pageOnly: string]: unknown
  routes: Ref<Pick<Route, 'id' | 'name'>[]>
  stations: Ref<Station[]>
  services: Ref<Pick<Service, 'id' | 'name' | 'route_id'>[]>
}

const mockUseScenario = vi.fn<() => Network>()

// A plain component object: the page under test is this file's one component.
const MapView = {
  name: 'MapView',
  props: {
    activeStation: { type: String as PropType<string | null>, default: null },
  },
  emits: ['station-hover'],
  setup: () => () => h('div'),
}

const Page = defineComponent({
  props: { isochrone: { type: Object as PropType<ChainResponse>, required: true } },
  setup(props) {
    const { routes, stations, services } = mockUseScenario()
    const active = ref<{ slug: string; fromMap: boolean } | null>(null)
    const graph = computed(() =>
      buildTimeRemainingGraph(props.isochrone.metadata, {
        stationName: (slug) => stations.value.find((s) => s.slug === slug)?.name ?? UNNAMED_STATION,
        serviceName: (id) => services.value.find((s) => s.id === id)?.name ?? UNNAMED_LINE,
        line: lineByRoute(services.value, routes.value),
        mode: props.isochrone.metadata.mode,
      }),
    )
    const highlight = (slug: string | null, fromMap: boolean) => {
      active.value = slug ? { slug, fromMap } : null
    }
    return () =>
      h('div', [
        h(MapView, {
          activeStation: active.value?.slug ?? null,
          onStationHover: (slug: string | null) => highlight(slug, true),
        }),
        graph.value.views.length
          ? h(TimeRemaining, {
            views: graph.value.views,
            activeSlug: active.value?.slug ?? null,
            activeFromMap: active.value?.fromMap ?? false,
            onActivate: (slug: string | null) => highlight(slug, false),
          })
          : null,
      ])
  },
})

async function plot(isochrone: ChainResponse, panelScroller?: HTMLElement) {
  const wrapper = mount(Page, {
    props: { isochrone },
    global: panelScroller ? { provide: { [PHONE_PANEL_SCROLLER]: ref(panelScroller) } } : {},
  })
  await flushPromises()
  return wrapper
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  mockUseScenario.mockReset()
  mockUseScenario.mockReturnValue({
    routes: ref([]),
    stations: ref(stubStations),
    services: ref([]),
  })
})

describe('TimeRemaining', () => {
  // alpha --trunk--> beta, with beta forking on to gamma and delta. Enough
  // shape to see the graph fork, the flags, and a change of service.
  const journeyIsochrone: ChainResponse = {
    type: 'FeatureCollection',
    features: [],
    metadata: {
      reachable_stations: [
        { station_slug: 'sf', access_mins: 5, access_secs: 300, remaining_mins: 115, remaining_secs: 6900 },
        {
          station_slug: 'sj',
          access_mins: 5,
          access_secs: 300,
          remaining_mins: 90,
          remaining_secs: 5400,
          predecessor_slug: 'sf',
          board_slug: 'sf',
          board_wait_secs: 600,
          legs: [{ from: 'sf', to: 'sj', service_id: 'svc-trunk', secs: 900, dwell_s: 60 }],
        },
      ],
      origin_budget_mins: 120,
      compile_job_id: 'compile-1',
      mode: 'walk',
      wait_model: 'headway_over_2_peak',
      origin_iso_available: true,
    },
  }

  // happy-dom implements no scrolling. The card no longer calls this at all,
  // and one case below is here to keep it that way — a stub rather than the
  // real thing so a call would be caught rather than silently ignored.
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
  })

  // Each service on a route of its own, so each is its own line, by name.
  function servicesNamed() {
    mockUseScenario.mockReturnValue({
      name: ref('CA HSR'),
      description: ref('California High-Speed Rail'),
      routes: ref([]),
      stations: ref(stubStations),
      services: ref([
        { id: 'svc-trunk', name: 'Trunk', frequency_windows: [] },
        { id: 'svc-spur', name: 'Spur', frequency_windows: [] },
      ]),
      loading: ref(false),
    })
  }

  it('renders the starting location and every station reached, in countdown order', async () => {
    const wrapper = await plot(journeyIsochrone)

    const rows = wrapper.findAll('[data-testid="time-remaining-row"]')
    expect(rows.map((row) => row.get('[data-testid="time-remaining-value"]').text()))
      .toEqual(['2h 0m', '1h 45m', '1h 30m'])
    expect(rows[0].text()).toContain('Starting point')
    expect(rows[1].text()).toContain('San Francisco')
    expect(rows[2].text()).toContain('San Jose')
  })

  it('flags how the rider leaves each row, and leaves the end of a branch unflagged', async () => {
    servicesNamed()
    const wrapper = await plot(journeyIsochrone)

    const flags = wrapper.findAll('[data-testid="time-remaining-row"]')
      .map((row) => row.find('[data-testid="time-remaining-flag"]'))
    expect(flags[0].text()).toBe('Walk')
    expect(flags[1].text()).toBe('Trunk')
    expect(flags[2].exists()).toBe(false)
  })

  it('calls a line the page has no record of unnamed, never by its id', async () => {
    const wrapper = await plot(journeyIsochrone)

    const flag = wrapper.findAll('[data-testid="time-remaining-row"]')[1]
      .get('[data-testid="time-remaining-flag"]')
    expect(flag.text()).toBe('Unnamed line')
    expect(wrapper.get('[data-testid="time-remaining"]').text()).not.toContain('svc-trunk')
  })

  it('expands a row on hover, with the detail its single number hides', async () => {
    const wrapper = await plot(journeyIsochrone)
    const row = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
    expect(row.find('[data-testid="time-remaining-detail"]').exists()).toBe(false)

    await row.trigger('mouseenter')

    const detail = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
      .get('[data-testid="time-remaining-detail"]').text()
    expect(detail).toContain('Arrived with')
    expect(detail).toContain('Stopped here for')
    expect(detail).toContain('Rode in from San Francisco')
  })

  // The detail is a journey, so it reads in the order the rider lives it:
  // the leg in, what that left them with, then the stop served here.
  it('reads the detail in the order the rider travels it', async () => {
    const wrapper = await plot(journeyIsochrone)

    await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('mouseenter')

    const terms = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
      .get('[data-testid="time-remaining-detail"]')
      .findAll('dt').map((term) => term.text())
    expect(terms).toEqual(['Rode in from San Francisco', 'Arrived with', 'Stopped here for'])
  })

  // The detail used to grow the row it belonged to, which reflowed the list
  // under the pointer and moved every row below the one being read.
  it('shows the detail out of the list flow, so no row resizes', async () => {
    const wrapper = await plot(journeyIsochrone)

    await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('mouseenter')

    const tip = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
      .get('[data-testid="time-remaining-detail"]').element.parentElement
    expect(tip?.className).toContain('fixed')
    // Nothing about the row animates open any more.
    expect(wrapper.html()).not.toContain('grid-rows-[0fr]')
  })

  it('expands a row on focus too, so the detail is reachable from the keyboard', async () => {
    const wrapper = await plot(journeyIsochrone)

    await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('focus')

    expect(wrapper.findAll('[data-testid="time-remaining-row"]')[2]
      .find('[data-testid="time-remaining-detail"]').exists()).toBe(true)
  })

  it('expands only one row at a time', async () => {
    const wrapper = await plot(journeyIsochrone)
    const rows = () => wrapper.findAll('[data-testid="time-remaining-row"]')

    await rows()[1].trigger('mouseenter')
    await rows()[2].trigger('mouseenter')

    expect(wrapper.findAll('[data-testid="time-remaining-detail"]')).toHaveLength(1)
  })

  it('raises the hovered row all the way to the map', async () => {
    const wrapper = await plot(journeyIsochrone)

    await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('mouseenter')

    expect(wrapper.findComponent({ name: 'MapView' }).props('activeStation')).toBe('sj')
  })

  it('takes a station hovered on the map back and expands its row', async () => {
    const wrapper = await plot(journeyIsochrone)

    await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sj')

    const row = wrapper.findAll('[data-testid="time-remaining-row"]')[2]
    expect(row.find('[data-testid="time-remaining-detail"]').exists()).toBe(true)
  })

  // happy-dom lays nothing out, so the geometry the card measures is stated
  // here: a list showing rows between y=100 and y=300, and a row sitting 80px
  // below the foot of it.
  function placeBelowTheFold(wrapper: Awaited<ReturnType<typeof plot>>, index: number) {
    const list = wrapper.get('[data-testid="time-remaining"] ul').element as HTMLElement
    const row = wrapper.findAll('[data-testid="time-remaining-row"]')[index].element as HTMLElement
    list.getBoundingClientRect = () => ({ top: 100, bottom: 300 }) as DOMRect
    row.getBoundingClientRect = () => ({ top: 340, bottom: 380 }) as DOMRect
    return list
  }

  it('scrolls a map-originated row into view, and one of its own never', async () => {
    const wrapper = await plot(journeyIsochrone)
    const list = placeBelowTheFold(wrapper, 1)

    await wrapper.findAll('[data-testid="time-remaining-row"]')[2].trigger('mouseenter')
    await flushPromises()
    expect(list.scrollTop).toBe(0)

    await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sf')
    await flushPromises()
    expect(list.scrollTop).toBe(80)
  })

  // scrollIntoView scrolls every scrollable ancestor an element has, the
  // window included, so a map hover used to yank the page down to wherever
  // this card sat.
  it('never scrolls the page under the rider pointing at the map', async () => {
    const wrapper = await plot(journeyIsochrone)
    placeBelowTheFold(wrapper, 1)

    await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sf')
    await flushPromises()

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  // SPA-508: inside the phone panel the list scrolled inside a panel that
  // scrolls too, and a swipe that started on it stopped at the list's end.
  it('leaves the scrolling to the phone panel it sits in', async () => {
    const panel = document.createElement('div')
    const wrapper = await plot(journeyIsochrone, panel)
    const list = wrapper.get('[data-testid="time-remaining"] ul').element as HTMLElement
    const row = wrapper.findAll('[data-testid="time-remaining-row"]')[1].element as HTMLElement
    panel.getBoundingClientRect = () => ({ top: 100, bottom: 300 }) as DOMRect
    row.getBoundingClientRect = () => ({ top: 340, bottom: 380 }) as DOMRect

    expect(list.className).not.toContain('overflow-y-auto')
    expect(list.className).not.toContain('max-h-')

    await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'sf')
    await flushPromises()
    expect(panel.scrollTop).toBe(80)
    expect(list.scrollTop).toBe(0)
  })

  it('scrolls its own list anywhere else', async () => {
    const wrapper = await plot(journeyIsochrone)
    const list = wrapper.get('[data-testid="time-remaining"] ul').element as HTMLElement

    expect(list.className).toContain('overflow-y-auto')
    expect(list.className).toContain('max-h-')
  })

  // The connectors used to sit in a scroller, which clipped the bottom of a
  // branch behind the scrollbar and put far lanes out of sight entirely.
  it('never puts the connectors behind a scrollbar', async () => {
    const wrapper = await plot(journeyIsochrone)

    expect(wrapper.find('[data-graph-scroller]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('overflow-x-auto')
  })

  // San Francisco branching two ways, which is the only shape that puts a
  // second lane on the page and so the only one that draws a fork bar.
  const branchingIsochrone: ChainResponse = {
    ...journeyIsochrone,
    metadata: {
      ...journeyIsochrone.metadata,
      reachable_stations: [
        ...journeyIsochrone.metadata.reachable_stations,
        {
          station_slug: 'gilroy',
          access_mins: 5,
          access_secs: 300,
          remaining_mins: 70,
          remaining_secs: 4200,
          predecessor_slug: 'sf',
          board_slug: 'sf',
          board_wait_secs: 600,
          legs: [{ from: 'sf', to: 'gilroy', service_id: 'svc-trunk', secs: 1500, dwell_s: 60 }],
        },
      ],
    },
  }

  it('branches along a bar level with the node, then drops down each lane', async () => {
    const wrapper = await plot(branchingIsochrone)
    const sf = wrapper.findAll('[data-testid="time-remaining-row"]')
      .find((row) => row.attributes('data-station-slug') === 'sf')

    expect(sf).toBeDefined()
    // One bar joining the lanes the branches leave for...
    expect(sf!.findAll('span.h-px')).toHaveLength(1)
    // ...and a drop down each of them, held to the row's bottom edge so it
    // stretches as the row expands rather than being redrawn at a new angle.
    const drops = sf!.findAll('span.w-px')
      .filter((line) => line.attributes('style')?.includes('bottom: 0'))
    expect(drops).toHaveLength(2)
    // No diagonal, so nothing about the branch depends on the row's height.
    expect(sf!.html()).not.toContain('<svg')
  })

  // A scenario with a spur: the rider rides the trunk to San Jose and
  // changes there for the branch line.
  const twoServiceIsochrone: ChainResponse = {
    ...journeyIsochrone,
    metadata: {
      ...journeyIsochrone.metadata,
      reachable_stations: [
        ...journeyIsochrone.metadata.reachable_stations,
        {
          station_slug: 'gilroy',
          access_mins: 5,
          access_secs: 300,
          remaining_mins: 60,
          remaining_secs: 3600,
          predecessor_slug: 'sj',
          board_slug: 'sf',
          board_wait_secs: 600,
          legs: [
            { from: 'sf', to: 'sj', service_id: 'svc-trunk', secs: 900, dwell_s: 60 },
            { from: 'sj', to: 'gilroy', service_id: 'svc-spur', secs: 1800, dwell_s: 30 },
          ],
        },
      ],
    },
  }

  it('offers a switcher between the lines, opening on the first of them', () => {
    servicesNamed()
    return plot(twoServiceIsochrone).then((wrapper) => {
      const labels = wrapper.findAll('[data-testid="time-remaining-service"] label').map((l) => l.text())
      // One tab per line and no tab for the walk to San Francisco, which the
      // trunk's own view already opens with (SPA-243).
      expect(labels).toEqual(['Trunk', 'Spur'])
      expect(wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text()))
        .toEqual(expect.arrayContaining([expect.stringContaining('San Jose')]))
    })
  })

  it('cuts to the line chosen, showing that one alone', () => {
    return plot(twoServiceIsochrone).then(async (wrapper) => {
      await wrapper.find('[data-testid="time-remaining-service-option-1"]').setValue()

      const slugs = wrapper.findAll('[data-testid="time-remaining-row"]')
        .map((r) => r.attributes('data-station-slug'))
      expect(slugs).toContain('gilroy')
      // San Francisco belongs to the trunk's story, not the spur's: it is
      // named on the starting location as where the walk went, not as a row.
      expect(slugs).not.toContain('sf')
    })
  })

  // SPA-342: San Jose is walked to as well, and the spur is boarded there
  // rather than by changing off the trunk. The search set off from both.
  const boardedApartIsochrone: ChainResponse = {
    ...journeyIsochrone,
    metadata: {
      ...journeyIsochrone.metadata,
      reachable_stations: [
        journeyIsochrone.metadata.reachable_stations[0],
        { station_slug: 'sj', access_mins: 20, access_secs: 1200, remaining_mins: 100, remaining_secs: 6000 },
        {
          station_slug: 'gilroy',
          access_mins: 20,
          access_secs: 1200,
          remaining_mins: 70,
          remaining_secs: 4200,
          predecessor_slug: 'sj',
          board_slug: 'sj',
          board_wait_secs: 600,
          legs: [{ from: 'sj', to: 'gilroy', service_id: 'svc-spur', secs: 1200 }],
        },
        {
          station_slug: 'sf-north',
          access_mins: 5,
          access_secs: 300,
          remaining_mins: 90,
          remaining_secs: 5400,
          predecessor_slug: 'sf',
          board_slug: 'sf',
          board_wait_secs: 600,
          legs: [{ from: 'sf', to: 'sf-north', service_id: 'svc-trunk', secs: 900 }],
        },
      ],
    },
  }

  it('names on the starting location the station the chosen line was boarded at', async () => {
    const wrapper = await plot(boardedApartIsochrone)
    const access = () => wrapper.findAll('[data-testid="time-remaining-access"]').map((a) => a.text())

    expect(access()).toEqual(['to San Francisco, 5m'])
    await wrapper.find('[data-testid="time-remaining-service-option-1"]').setValue()
    expect(access()).toEqual(['to San Jose, 20m'])
  })

  it('reads Walk, not Transit, where a transit access leg walked the whole way', async () => {
    const metadata = boardedApartIsochrone.metadata
    const wrapper = await plot({
      ...boardedApartIsochrone,
      metadata: {
        ...metadata,
        mode: 'transit',
        reachable_stations: metadata.reachable_stations.map((station) => ({
          ...station,
          access_rode_transit: (station.legs?.[0]?.from ?? station.station_slug) === 'sj',
        })),
      },
    })
    const origin = () => wrapper.findAll('[data-testid="time-remaining-row"]')[0]

    expect(origin().find('[data-testid="time-remaining-flag"]').text()).toBe('Walk')
    expect(origin().find('[data-testid="time-remaining-access"]').text()).toBe('to San Francisco, 5m')
    await wrapper.find('[data-testid="time-remaining-service-option-1"]').setValue()
    expect(origin().find('[data-testid="time-remaining-flag"]').text()).toBe('Transit')
    expect(origin().find('[data-testid="time-remaining-access"]').text()).toBe('to San Jose, 20m')
  })

  it('says how each access leg was covered when one line was reached both ways', async () => {
    const metadata = boardedApartIsochrone.metadata
    const wrapper = await plot({
      ...boardedApartIsochrone,
      metadata: {
        ...metadata,
        mode: 'transit',
        reachable_stations: metadata.reachable_stations.map((station) => ({
          ...station,
          legs: station.legs?.map((leg) => ({ ...leg, service_id: 'svc-trunk' })),
          access_rode_transit: (station.legs?.[0]?.from ?? station.station_slug) === 'sj',
        })),
      },
    })

    expect(wrapper.find('[data-testid="time-remaining-flag"]').text()).toBe('Transit')
    expect(wrapper.findAll('[data-testid="time-remaining-access"]').map((a) => a.text())).toEqual([
      'Walk to San Francisco, 5m',
      'Transit to San Jose, 20m',
    ])
  })

  it('cuts to the line a station hovered on the map is on', async () => {
    const wrapper = await plot(twoServiceIsochrone)
    expect(wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text())
      .some((text) => text.includes('Gilroy'))).toBe(false)

    await wrapper.findComponent({ name: 'MapView' }).vm.$emit('station-hover', 'gilroy')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text())
      .some((text) => text.includes('Gilroy'))).toBe(true)
  })

  it('offers no switcher when the trip is over one line', async () => {
    const wrapper = await plot({
      ...journeyIsochrone,
      metadata: {
        ...journeyIsochrone.metadata,
        reachable_stations: [journeyIsochrone.metadata.reachable_stations[0]],
      },
    })

    expect(wrapper.find('[data-testid="time-remaining-service"]').exists()).toBe(false)
  })

  // The same trip, told to a page that knows both services run over one
  // railway. That knowledge is the whole difference between two tabs and one.
  function servicesShareOneLine() {
    const service = (id: string, name: string) => ({
      id,
      route_id: 'route-1',
      name,
      vehicle_type: { id: 'vt-1', name: 'HSR', propulsion: 'electric', max_speed_kmh: 350 },
      direction: 'both',
      provenance: 'calibrated' as const,
      stop_count: 3,
      frequency_windows: [],
    })
    mockUseScenario.mockReturnValue({
      name: ref('CA HSR'),
      description: ref('California High-Speed Rail'),
      routes: ref([{
        id: 'route-1',
        scenario_id: 's1',
        name: 'CA HSR Phase 1 — San Francisco to Anaheim',
        mode: 'rail',
        geometry: { type: 'LineString' as const, coordinates: [] },
        bidirectional: true,
      }]),
      stations: ref(stubStations),
      services: ref([service('svc-trunk', 'HSR Local'), service('svc-spur', 'HSR Express')]),
    })
  }

  it('offers one tab per railway, not one per timetable', async () => {
    servicesShareOneLine()
    const wrapper = await plot(twoServiceIsochrone)

    // Two services over one railway are one line, and one line is the whole
    // trip — so there is nothing left to switch between.
    expect(wrapper.find('[data-testid="time-remaining-service"]').exists()).toBe(false)
  })

  it('draws the two services as branches of that one line, each row naming its own', async () => {
    servicesShareOneLine()
    const wrapper = await plot(twoServiceIsochrone)

    // Both stations on one tab, where before they were a tab apart.
    const names = wrapper.findAll('[data-testid="time-remaining-row"]').map((r) => r.text())
    expect(names.some((text) => text.includes('San Jose'))).toBe(true)
    expect(names.some((text) => text.includes('Gilroy'))).toBe(true)
    // The line is one railway; which train is still the row's own business.
    expect(wrapper.findAll('[data-testid="time-remaining-flag"]').map((f) => f.text()))
      .toEqual(['Walk', 'HSR Local', 'HSR Express'])
  })

  it('draws a lone reachable station as a two-row graph', async () => {
    const wrapper = await plot({
      ...journeyIsochrone,
      metadata: {
        ...journeyIsochrone.metadata,
        reachable_stations: [journeyIsochrone.metadata.reachable_stations[0]],
      },
    })

    expect(wrapper.findAll('[data-testid="time-remaining-row"]')).toHaveLength(2)
  })
})
