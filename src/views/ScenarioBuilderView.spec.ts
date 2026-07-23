import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Job, Scenario, Service } from '../api/authoring/types'
import type { ChainResponse } from '../fixtures/isochrone'

vi.mock('../api/authoring/services', () => ({
  fetchMyServices: vi.fn(),
}))
vi.mock('../api/authoring/scenarios', () => ({
  createScenario: vi.fn(),
  compileScenario: vi.fn(),
  fetchScenarioIsochrone: vi.fn(),
}))

import ScenarioBuilderView from './ScenarioBuilderView.vue'
import { fetchMyServices } from '../api/authoring/services'
import { createScenario, compileScenario, fetchScenarioIsochrone } from '../api/authoring/scenarios'
import { ApiError } from '../api/authoring/client'
import { useDraftsStore } from '../stores/drafts'

const stubServiceA: Service = {
  id: 'svc1',
  slug: 'northbound-express',
  route_id: 'rt1',
  name: 'Northbound Express',
  stops: [],
  vehicle: { max_speed_kmh: 320, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 },
  frequency_windows: [],
}

const stubServiceB: Service = {
  id: 'svc2',
  slug: 'southbound-local',
  route_id: 'rt1',
  name: 'Southbound Local',
  stops: [],
  vehicle: { max_speed_kmh: 120, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 },
  frequency_windows: [],
}

const stubScenario: Scenario = {
  id: 's1',
  slug: 'ca-hsr',
  name: 'CA HSR',
  description: '',
  service_ids: ['svc1', 'svc2'],
}

const stubChainResponse = {
  type: 'FeatureCollection',
  features: [],
  metadata: {
    reachable_stations: [],
    origin_budget_mins: 30,
    scenario_slug: 'ca-hsr',
    mode: 'walk',
    wait_model: 'boarding-only',
    origin_iso_available: true,
  },
} as unknown as ChainResponse

function mountView() {
  return mount(ScenarioBuilderView, {
    global: { stubs: { MapView: true } },
  })
}

async function fillAndSelect(wrapper: ReturnType<typeof mountView>) {
  await wrapper.find('[data-testid="scenario-name"]').setValue('CA HSR')
  await wrapper.find('[data-testid="service-checkbox-svc1"]').setValue(true)
  await wrapper.find('[data-testid="service-checkbox-svc2"]').setValue(true)
}

async function submitIsochroneForm(wrapper: ReturnType<typeof mountView>) {
  await wrapper.find('[data-testid="lat"]').setValue('37.7')
  await wrapper.find('[data-testid="lng"]').setValue('-122.4')
  await wrapper.find('form').trigger('submit')
}

describe('ScenarioBuilderView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.mocked(fetchMyServices).mockResolvedValue([stubServiceA, stubServiceB])
    vi.mocked(createScenario).mockResolvedValue(stubScenario)
    vi.mocked(compileScenario).mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' } as Job)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads the caller\'s services and offers them as a checklist', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="service-checkbox-svc1"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Northbound Express')
    expect(wrapper.text()).toContain('Southbound Local')
  })

  it('shows an error state when services fail to load', async () => {
    vi.mocked(fetchMyServices).mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="services-error"]').exists()).toBe(true)
  })

  it('disables save until a name and at least one service are chosen', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="save-scenario"]').attributes('disabled')).toBeDefined()

    await fillAndSelect(wrapper)
    expect(wrapper.find('[data-testid="save-scenario"]').attributes('disabled')).toBeUndefined()
  })

  it('toggles a service in and out of the draft selection', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="service-checkbox-svc1"]').setValue(true)
    expect(useDraftsStore().scenarioDraft?.service_ids).toEqual(['svc1'])

    await wrapper.find('[data-testid="service-checkbox-svc1"]').setValue(false)
    expect(useDraftsStore().scenarioDraft?.service_ids).toEqual([])
  })

  it('saves, triggers a compile, polls the job, and reveals the isochrone form once compiled', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'succeeded', result: { services: [] } }),
    } as Response)

    const wrapper = mountView()
    await flushPromises()
    await fillAndSelect(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createScenario).toHaveBeenCalledWith(expect.objectContaining({ name: 'CA HSR', service_ids: ['svc1', 'svc2'] }))
    expect(compileScenario).toHaveBeenCalledWith('ca-hsr')
    expect(wrapper.find('[data-testid="compiling-status"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'IsochroneForm' }).exists()).toBe(true)
  })

  it('clears the scenario draft once saved', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'succeeded', result: { services: [] } }),
    } as Response)

    const wrapper = mountView()
    await flushPromises()
    await fillAndSelect(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(useDraftsStore().scenarioDraft).toBeNull()
  })

  it('shows the save error from the API when creation is rejected', async () => {
    vi.mocked(createScenario).mockRejectedValue(new ApiError('POST /api/user-scenarios failed: 422: name required', 422))
    const wrapper = mountView()
    await flushPromises()
    await fillAndSelect(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="submit-error"]').text()).toContain('name required')
    expect(compileScenario).not.toHaveBeenCalled()
  })

  async function saveAndCompile(wrapper: ReturnType<typeof mountView>) {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'job1', kind: 'compile_user_scenario', status: 'succeeded', result: { services: [] } }),
    } as Response)
    await flushPromises()
    await fillAndSelect(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
  }

  it('renders the isochrone once the form is submitted, hitting the user-scenario isochrone endpoint', async () => {
    vi.mocked(fetchScenarioIsochrone).mockResolvedValue(stubChainResponse)
    const wrapper = mountView()
    await saveAndCompile(wrapper)

    await submitIsochroneForm(wrapper)
    await flushPromises()

    expect(fetchScenarioIsochrone).toHaveBeenCalledWith('ca-hsr', expect.objectContaining({ lat: 37.7, lng: -122.4 }))
  })

  it('transparently recompiles and retries on a stale-graph 409, showing "recompiling…" rather than an error', async () => {
    vi.mocked(fetchScenarioIsochrone)
      .mockRejectedValueOnce(new ApiError('stale', 409, 'stale_graph'))
      .mockResolvedValueOnce(stubChainResponse)

    const wrapper = mountView()
    await saveAndCompile(wrapper)
    vi.mocked(compileScenario).mockClear()

    await submitIsochroneForm(wrapper)
    await flushPromises()

    expect(compileScenario).toHaveBeenCalledWith('ca-hsr')
    expect(fetchScenarioIsochrone).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="fetch-error"]').exists()).toBe(false)
  })

  it('shows an error when the isochrone request fails for a non-stale reason', async () => {
    vi.mocked(fetchScenarioIsochrone).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountView()
    await saveAndCompile(wrapper)

    await submitIsochroneForm(wrapper)
    await flushPromises()

    expect(wrapper.find('[data-testid="fetch-error"]').text()).toContain('Failed to generate isochrone')
  })
})
