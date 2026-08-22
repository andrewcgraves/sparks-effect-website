import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PrerenderedIsochrones from './PrerenderedIsochrones.vue'
import type {
  PrerenderedIsochrone,
  PrerenderedIsochroneSummary,
} from '../api/prerenderedIsochrones'
import type { ChainResponse } from '../fixtures/isochrone'

vi.mock('../api/prerenderedIsochrones', () => ({
  listPrerenderedIsochrones: vi.fn(),
  fetchPrerenderedIsochrone: vi.fn(),
}))

import {
  fetchPrerenderedIsochrone,
  listPrerenderedIsochrones,
} from '../api/prerenderedIsochrones'

function summary(over: Partial<PrerenderedIsochroneSummary> = {}): PrerenderedIsochroneSummary {
  return {
    id: 'pre-1',
    label: 'Downtown SF, 30 min walk',
    lat: 37.7749,
    lng: -122.4194,
    budget_mins: 30,
    mode: 'walk',
    outdated: false,
    created_at: '2026-08-01T12:00:00Z',
    ...over,
  }
}

function chain(budget = 30): ChainResponse {
  return {
    type: 'FeatureCollection',
    features: [],
    metadata: {
      reachable_stations: [],
      origin_budget_mins: budget,
      compile_job_id: 'compile-1',
      mode: 'walk',
      wait_model: 'half-headway',
      origin_iso_available: true,
    },
  }
}

function detail(over: Partial<PrerenderedIsochrone> = {}): PrerenderedIsochrone {
  return { ...summary(), result: chain(), ...over }
}

function mountCard(slug = 'ca-hsr') {
  return mount(PrerenderedIsochrones, { props: { slug } })
}

async function mountLoaded(items: PrerenderedIsochroneSummary[]) {
  vi.mocked(listPrerenderedIsochrones).mockResolvedValue(items)
  const wrapper = mountCard()
  await flushPromises()
  return wrapper
}

describe('PrerenderedIsochrones', () => {
  beforeEach(() => {
    vi.mocked(listPrerenderedIsochrones).mockReset().mockResolvedValue([])
    vi.mocked(fetchPrerenderedIsochrone).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists the scenario named by the slug prop', async () => {
    await mountLoaded([summary()])
    expect(listPrerenderedIsochrones).toHaveBeenCalledWith('ca-hsr')
  })

  it('renders one button per entry, each labelled by its label', async () => {
    const wrapper = await mountLoaded([
      summary({ id: 'pre-1', label: 'Downtown SF, 30 min walk' }),
      summary({ id: 'pre-2', label: 'San Jose, 60 min bike' }),
    ])

    const buttons = wrapper.findAll('[data-testid="prerendered-entry"]')
    expect(buttons).toHaveLength(2)
    expect(buttons.map((b) => b.text())).toEqual([
      expect.stringContaining('Downtown SF, 30 min walk'),
      expect.stringContaining('San Jose, 60 min bike'),
    ])
    expect(buttons[0].element.tagName).toBe('BUTTON')
  })

  // The card is an offer, not a status: with nothing to offer there is no
  // heading, no empty-state line, and no gap left in the rail.
  it('renders nothing at all for a scenario with no pre-rendered isochrones', async () => {
    const wrapper = await mountLoaded([])
    expect(wrapper.find('[data-testid="prerendered-isochrones"]').exists()).toBe(false)
    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('renders nothing while the list is still in flight', async () => {
    vi.mocked(listPrerenderedIsochrones).mockReturnValue(new Promise(() => {}))
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.find('[data-testid="prerendered-isochrones"]').exists()).toBe(false)
  })

  // A list that fails is the same to the rider as a scenario with none: the
  // form beside it is the way to plot one either way.
  it('renders nothing when the list fetch fails', async () => {
    vi.mocked(listPrerenderedIsochrones).mockRejectedValue(new Error('API down'))
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.find('[data-testid="prerendered-isochrones"]').exists()).toBe(false)
  })

  describe('picking an entry', () => {
    it('fetches that entry by id and emits its chain', async () => {
      const picked = detail({ id: 'pre-2', result: chain(60) })
      vi.mocked(fetchPrerenderedIsochrone).mockResolvedValue(picked)
      const wrapper = await mountLoaded([summary({ id: 'pre-1' }), summary({ id: 'pre-2' })])

      await wrapper.findAll('[data-testid="prerendered-entry"]')[1].trigger('click')
      await flushPromises()

      expect(fetchPrerenderedIsochrone).toHaveBeenCalledWith('pre-2')
      expect(wrapper.emitted('select')).toHaveLength(1)
      expect(wrapper.emitted('select')![0]).toEqual([picked.result])
    })

    it('marks only the clicked entry busy while its chain is in flight', async () => {
      let resolveDetail!: (value: PrerenderedIsochrone) => void
      vi.mocked(fetchPrerenderedIsochrone).mockReturnValue(
        new Promise<PrerenderedIsochrone>((res) => { resolveDetail = res }),
      )
      const wrapper = await mountLoaded([summary({ id: 'pre-1' }), summary({ id: 'pre-2' })])

      await wrapper.findAll('[data-testid="prerendered-entry"]')[0].trigger('click')

      const entries = () => wrapper.findAll('[data-testid="prerendered-entry"]')
      expect(entries()[0].attributes('aria-busy')).toBe('true')
      expect(entries()[0].attributes('disabled')).toBeDefined()
      expect(entries()[0].get('[data-testid="prerendered-entry-detail"]').text()).toBe('Loading…')
      expect(entries()[1].attributes('aria-busy')).toBe('false')
      expect(entries()[1].attributes('disabled')).toBeUndefined()

      resolveDetail(detail())
      await flushPromises()
      expect(entries()[0].attributes('disabled')).toBeUndefined()
      expect(entries()[0].get('[data-testid="prerendered-entry-detail"]').text()).toContain('30 min')
    })

    // The payloads are hundreds of kilobytes, so a second pick landing before
    // the first commonly outlives it — the last one asked for has to win.
    it('ignores a slower earlier pick once a later one has been made', async () => {
      const resolvers: ((value: PrerenderedIsochrone) => void)[] = []
      vi.mocked(fetchPrerenderedIsochrone).mockImplementation(
        () => new Promise<PrerenderedIsochrone>((res) => { resolvers.push(res) }),
      )
      const wrapper = await mountLoaded([summary({ id: 'pre-1' }), summary({ id: 'pre-2' })])

      await wrapper.findAll('[data-testid="prerendered-entry"]')[0].trigger('click')
      await wrapper.findAll('[data-testid="prerendered-entry"]')[1].trigger('click')

      const second = detail({ id: 'pre-2', result: chain(60) })
      resolvers[1](second)
      await flushPromises()
      resolvers[0](detail({ id: 'pre-1', result: chain(30) }))
      await flushPromises()

      expect(wrapper.emitted('select')).toHaveLength(1)
      expect(wrapper.emitted('select')![0]).toEqual([second.result])
    })

    it('surfaces a failed detail fetch inline, leaving the list usable', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchPrerenderedIsochrone).mockRejectedValueOnce(new Error('API down'))
      const wrapper = await mountLoaded([summary({ id: 'pre-1', label: 'Downtown SF' })])

      await wrapper.findAll('[data-testid="prerendered-entry"]')[0].trigger('click')
      await flushPromises()

      const error = wrapper.get('[data-testid="prerendered-detail-error"]')
      expect(error.text()).toContain('Downtown SF')
      expect(error.attributes('role')).toBe('alert')
      expect(error.classes()).toContain('text-coral')
      expect(wrapper.emitted('select')).toBeUndefined()
      expect(wrapper.findAll('[data-testid="prerendered-entry"]')).toHaveLength(1)
      expect(wrapper.findAll('[data-testid="prerendered-entry"]')[0].attributes('disabled'))
        .toBeUndefined()
    })

    it('clears the error when a later pick succeeds', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetchPrerenderedIsochrone)
        .mockRejectedValueOnce(new Error('API down'))
        .mockResolvedValueOnce(detail())
      const wrapper = await mountLoaded([summary()])

      await wrapper.findAll('[data-testid="prerendered-entry"]')[0].trigger('click')
      await flushPromises()
      await wrapper.findAll('[data-testid="prerendered-entry"]')[0].trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="prerendered-detail-error"]').exists()).toBe(false)
      expect(wrapper.emitted('select')).toHaveLength(1)
    })
  })

  describe('an entry the scenario has moved on from', () => {
    // Still listed: it is a real plot over a real graph, and saying so is more
    // use to the rider than hiding it.
    it('lists it with an indicator, and leaves a fresh one unmarked', async () => {
      const wrapper = await mountLoaded([
        summary({ id: 'pre-1', label: 'Fresh', outdated: false }),
        summary({ id: 'pre-2', label: 'Stale', outdated: true }),
      ])

      const entries = wrapper.findAll('[data-testid="prerendered-entry"]')
      expect(entries).toHaveLength(2)
      expect(entries[0].find('[data-testid="prerendered-outdated"]').exists()).toBe(false)
      expect(entries[1].find('[data-testid="prerendered-outdated"]').exists()).toBe(true)
    })

    // Colour alone says nothing to a screen reader or to a rider who cannot
    // tell the two chips apart, so the indicator carries words as well.
    it('explains itself in words, not only in colour', async () => {
      const wrapper = await mountLoaded([summary({ outdated: true })])

      const badge = wrapper.get('[data-testid="prerendered-outdated"]')
      expect(badge.text()).toBe('Out of date')
      expect(badge.attributes('title')).toContain('out of date')
      expect(badge.attributes('aria-label')).toContain('Out of date')
    })

    it('is still pickable', async () => {
      const picked = detail({ id: 'pre-2', outdated: true })
      vi.mocked(fetchPrerenderedIsochrone).mockResolvedValue(picked)
      const wrapper = await mountLoaded([summary({ id: 'pre-2', outdated: true })])

      await wrapper.findAll('[data-testid="prerendered-entry"]')[0].trigger('click')
      await flushPromises()

      expect(wrapper.emitted('select')![0]).toEqual([picked.result])
    })
  })
})
