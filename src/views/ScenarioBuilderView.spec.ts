import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Scenario, Service } from '../api/authoring/types'

vi.mock('../api/authoring/services', () => ({
  fetchMyServices: vi.fn(),
}))
vi.mock('../api/authoring/scenarios', () => ({
  createScenario: vi.fn(),
  fetchScenario: vi.fn(),
  updateScenario: vi.fn(),
  compileScenario: vi.fn(),
}))

const push = vi.fn()
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
}))

import { breadcrumbTrail } from '../test/breadcrumbs'
import ScenarioBuilderView from './ScenarioBuilderView.vue'
import { fetchMyServices } from '../api/authoring/services'
import { compileScenario, createScenario, fetchScenario, updateScenario } from '../api/authoring/scenarios'
import { ApiError, SessionExpiredError } from '../api/authoring/client'
import { SESSION_EXPIRED_FAULT } from '../api/authoringFault'
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
  return mount(ScenarioBuilderView, { global: { stubs: { RouterLink: RouterLinkStub } } })
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

  it('shows where it sits: a new scenario, under My authoring', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(breadcrumbTrail(wrapper).map(([label]) => label)).toEqual(['My authoring', 'New scenario'])
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe('/authoring')
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

  it('stays loading, not failed, when the services are refused for an expired session', async () => {
    vi.mocked(fetchMyServices).mockRejectedValue(new SessionExpiredError('GET /api/services failed: 401'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="services-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Loading')
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

  it('says in plain words why the save failed and does not navigate', async () => {
    vi.mocked(createScenario).mockRejectedValue(new ApiError('POST /api/user-scenarios failed: 422: name required', 422))
    const wrapper = mountView()
    await flushPromises()
    await fillAndSelect(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="submit-error"]').text()).toBe(
      "Some of this scenario's details weren't accepted. Check them and try again.",
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('words a mid-save session expiry plainly, with no raw 401, and keeps the draft', async () => {
    vi.mocked(createScenario).mockRejectedValue(new SessionExpiredError('POST /api/user-scenarios failed: 401: unauthorized'))
    const wrapper = mountView()
    await flushPromises()
    await fillAndSelect(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="submit-error"]').text()).toBe(SESSION_EXPIRED_FAULT)
    expect(useDraftsStore().scenarioDraft).not.toBeNull()
  })
})

describe('ScenarioBuilderView editing an existing scenario', () => {
  const existing: Scenario = {
    id: 's1',
    slug: 'ca-hsr',
    name: 'CA HSR',
    description: 'California High-Speed Rail',
    service_ids: ['svc1'],
  }

  function mountEdit() {
    return mount(ScenarioBuilderView, {
      props: { slug: 'ca-hsr' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
  }

  function stubCompileJob(status: 'succeeded' | 'failed') {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'job1',
        kind: 'compile_user_scenario',
        status,
        result: status === 'succeeded' ? { services: [] } : undefined,
        error: status === 'failed' ? 'merge failed' : undefined,
      }),
    } as Response))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.mocked(fetchMyServices).mockResolvedValue([stubServiceA, stubServiceB])
    vi.mocked(fetchScenario).mockResolvedValue(existing)
    vi.mocked(updateScenario).mockImplementation(async (slug, input) => ({ ...existing, ...input, slug }))
    vi.mocked(compileScenario).mockResolvedValue({ id: 'job1', kind: 'compile_user_scenario', status: 'queued' } as never)
    stubCompileJob('succeeded')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens with the scenario\'s name, description and member services', async () => {
    const wrapper = mountEdit()
    await flushPromises()
    expect(fetchScenario).toHaveBeenCalledWith('ca-hsr')
    expect(wrapper.get('h1').text()).toBe('Edit scenario')
    expect((wrapper.get('[data-testid="scenario-name"]').element as HTMLInputElement).value).toBe('CA HSR')
    expect((wrapper.get('[data-testid="scenario-description"]').element as HTMLTextAreaElement).value)
      .toBe('California High-Speed Rail')
    expect((wrapper.get('[data-testid="service-checkbox-svc1"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('[data-testid="service-checkbox-svc2"]').element as HTMLInputElement).checked).toBe(false)
  })

  it('shows where it sits: editing this scenario, under My authoring', async () => {
    const wrapper = mountEdit()
    await flushPromises()
    expect(breadcrumbTrail(wrapper).map(([label]) => label)).toEqual(['My authoring', 'CA HSR', 'Edit'])
    expect(wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to')))
      .toEqual(['/authoring', '/authoring/scenarios/ca-hsr'])
  })

  it('names the tab after the scenario as loaded, not as typed', async () => {
    const wrapper = mountEdit()
    await flushPromises()
    expect(document.title).toBe('Edit CA HSR · Sparks Effect')
    await wrapper.get('[data-testid="scenario-name"]').setValue('CA HSR Phase 2')
    expect(document.title).toBe('Edit CA HSR · Sparks Effect')
  })

  it('leaves a new-scenario draft in progress alone', async () => {
    const drafts = useDraftsStore()
    drafts.startScenarioDraft({ name: 'Half-built', description: '', service_ids: ['svc2'] })
    const wrapper = mountEdit()
    await flushPromises()
    await wrapper.get('[data-testid="scenario-name"]').setValue('CA HSR Phase 2')
    expect(drafts.scenarioDraft).toEqual({ name: 'Half-built', description: '', service_ids: ['svc2'] })
  })

  it('saves changed members, name and description over the same scenario', async () => {
    const wrapper = mountEdit()
    await flushPromises()
    await wrapper.get('[data-testid="scenario-name"]').setValue('CA HSR Phase 2')
    await wrapper.get('[data-testid="scenario-description"]').setValue('With the Altamont link')
    await wrapper.get('[data-testid="service-checkbox-svc1"]').setValue(false)
    await wrapper.get('[data-testid="service-checkbox-svc2"]').setValue(true)
    expect(wrapper.get('[data-testid="save-scenario"]').text()).toBe('Save changes')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateScenario).toHaveBeenCalledWith('ca-hsr', {
      name: 'CA HSR Phase 2',
      description: 'With the Altamont link',
      service_ids: ['svc2'],
    })
    expect(createScenario).not.toHaveBeenCalled()
  })

  it('recompiles after saving and only then lands on the scenario\'s page', async () => {
    const wrapper = mountEdit()
    await flushPromises()
    await wrapper.get('[data-testid="service-checkbox-svc2"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(compileScenario).toHaveBeenCalledWith('ca-hsr', expect.anything())
    expect(replace).toHaveBeenCalledWith('/authoring/scenarios/ca-hsr')
    expect(push).not.toHaveBeenCalled()
  })

  it('reports a failed recompile and stays put, with a way to the scenario', async () => {
    stubCompileJob('failed')
    const wrapper = mountEdit()
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(replace).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="compile-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="save-scenario"]').exists()).toBe(false)
  })

  it('cannot save with every member service removed', async () => {
    const wrapper = mountEdit()
    await flushPromises()
    await wrapper.get('[data-testid="service-checkbox-svc1"]').setValue(false)
    expect(wrapper.get('[data-testid="save-scenario"]').attributes('disabled')).toBeDefined()
  })

  it('says the scenario was not found on a 404', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new ApiError('not found', 404))
    const wrapper = mountEdit()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-not-found"]').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('says loading failed on any other error', async () => {
    vi.mocked(fetchScenario).mockRejectedValue(new Error('boom'))
    const wrapper = mountEdit()
    await flushPromises()
    expect(wrapper.find('[data-testid="scenario-error"]').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('keeps the form and says why when the save is refused', async () => {
    vi.mocked(updateScenario).mockRejectedValue(new ApiError('PUT failed: 422', 422))
    const wrapper = mountEdit()
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="submit-error"]').text()).toBe(
      "Some of this scenario's details weren't accepted. Check them and try again.",
    )
    expect(compileScenario).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
})
