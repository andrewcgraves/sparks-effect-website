import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Scenario, Service } from '../api/authoring/types'

vi.mock('../api/authoring/services', () => ({
  fetchMyServices: vi.fn(),
}))
vi.mock('../api/authoring/scenarios', () => ({
  createScenario: vi.fn(),
}))

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

import ScenarioBuilderView from './ScenarioBuilderView.vue'
import { fetchMyServices } from '../api/authoring/services'
import { createScenario } from '../api/authoring/scenarios'
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

function mountView() {
  return mount(ScenarioBuilderView)
}

async function fillAndSelect(wrapper: ReturnType<typeof mountView>) {
  await wrapper.find('[data-testid="scenario-name"]').setValue('CA HSR')
  await wrapper.find('[data-testid="service-checkbox-svc1"]').setValue(true)
  await wrapper.find('[data-testid="service-checkbox-svc2"]').setValue(true)
}

describe('ScenarioBuilderView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.mocked(fetchMyServices).mockResolvedValue([stubServiceA, stubServiceB])
    vi.mocked(createScenario).mockResolvedValue(stubScenario)
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('saves the scenario and redirects to its preview page', async () => {
    const wrapper = mountView()
    await flushPromises()
    await fillAndSelect(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createScenario).toHaveBeenCalledWith(expect.objectContaining({ name: 'CA HSR', service_ids: ['svc1', 'svc2'] }))
    expect(push).toHaveBeenCalledWith({ name: 'scenario-detail', params: { slug: 'ca-hsr' } })
  })

  it('clears the scenario draft once saved', async () => {
    const wrapper = mountView()
    await flushPromises()
    await fillAndSelect(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(useDraftsStore().scenarioDraft).toBeNull()
  })

  it('shows the save error from the API and does not navigate when creation is rejected', async () => {
    vi.mocked(createScenario).mockRejectedValue(new ApiError('POST /api/user-scenarios failed: 422: name required', 422))
    const wrapper = mountView()
    await flushPromises()
    await fillAndSelect(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="submit-error"]').text()).toContain('name required')
    expect(push).not.toHaveBeenCalled()
  })
})
