import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Scenario, ScenarioInput, Service } from '../api/authoring/types'

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
import { busyRegion, visibleText } from '../test/loading'
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
    expect(breadcrumbTrail(wrapper).map(([label]) => label)).toEqual(['My authoring', 'New network'])
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
    expect(wrapper.get('[data-testid="services-loading"]').attributes('aria-busy')).toBe('true')
  })

  it('shows skeleton service rows, not loading copy, while the services load', () => {
    vi.mocked(fetchMyServices).mockReturnValue(new Promise(() => {}))
    const region = busyRegion(mountView(), 'services-loading')
    expect(region.findAll('[data-testid="list-card-skeleton"]').length).toBeGreaterThan(0)
    expect(visibleText(region)).toBe('')
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

  it('saves a new scenario with the boarding wait chosen and no interchanges', async () => {
    const wrapper = mountView()
    await flushPromises()
    await fillAndSelect(wrapper)
    await wrapper.get('[data-testid="boarding-wait-policy"]').setValue('half_headway')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createScenario).toHaveBeenCalledWith({
      name: 'CA HSR',
      description: '',
      service_ids: ['svc1', 'svc2'],
      interchange_pairs: [],
      boarding_wait: { policy: 'half_headway' },
    })
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
      "Some of this network's details weren't accepted. Check them and try again.",
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

  it('shows a form skeleton, not loading copy, while the scenario loads', () => {
    vi.mocked(fetchScenario).mockReturnValue(new Promise(() => {}))
    const region = busyRegion(mountEdit(), 'draft-loading')
    expect(region.findAll('[data-testid="field-skeleton"]')).toHaveLength(2)
    expect(visibleText(region)).toBe('')
  })

  it('opens with the scenario\'s name, description and member services', async () => {
    const wrapper = mountEdit()
    await flushPromises()
    expect(fetchScenario).toHaveBeenCalledWith('ca-hsr')
    expect(wrapper.get('h1').text()).toBe('Edit network')
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
    const halfBuilt = { name: 'Half-built', description: '', service_ids: ['svc2'], interchange_pairs: [], boarding_wait: null }
    drafts.startScenarioDraft(halfBuilt)
    const wrapper = mountEdit()
    await flushPromises()
    await wrapper.get('[data-testid="scenario-name"]').setValue('CA HSR Phase 2')
    await wrapper.get('[data-testid="boarding-wait-policy"]').setValue('full_headway')
    expect(drafts.scenarioDraft).toEqual(halfBuilt)
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
      interchange_pairs: [],
      boarding_wait: null,
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

  it('offers a way to the scenario while the recompile is still running', async () => {
    vi.mocked(compileScenario).mockReturnValue(new Promise(() => {}))
    const wrapper = mountEdit()
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="compiling-status"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="go-to-scenario"]').getComponent(RouterLinkStub).props('to'))
      .toBe('/authoring/scenarios/ca-hsr')
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

  describe('interchange pairs and the boarding wait', () => {
    const union = { service_id: 'svc1', slug: 'union' }
    const midtown = { service_id: 'svc2', slug: 'midtown' }
    const configured: Scenario = {
      ...existing,
      service_ids: ['svc1', 'svc2'],
      interchange_pairs: [{ a: union, b: midtown }],
      boarding_wait: { policy: 'fixed', secs: 120 },
    }

    beforeEach(() => {
      vi.mocked(fetchScenario).mockResolvedValue(configured)
    })

    async function save(wrapper: ReturnType<typeof mountEdit>) {
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      return vi.mocked(updateScenario).mock.calls[0][1]
    }

    // SPA-404: ScenarioInput had no field for either, so every edit wrote
    // them away.
    it('keeps interchange pairs and a boarding wait set through the API when an edit is saved', async () => {
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="scenario-name"]').setValue('CA HSR Phase 2')

      expect(await save(wrapper)).toEqual({
        name: 'CA HSR Phase 2',
        description: 'California High-Speed Rail',
        service_ids: ['svc1', 'svc2'],
        interchange_pairs: [{ a: union, b: midtown }],
        boarding_wait: { policy: 'fixed', secs: 120 },
      })
    })

    it('opens with the scenario\'s boarding wait', async () => {
      const wrapper = mountEdit()
      await flushPromises()
      expect((wrapper.get('[data-testid="boarding-wait-policy"]').element as HTMLSelectElement).value).toBe('fixed')
      expect((wrapper.get('[data-testid="boarding-wait-secs"]').element as HTMLInputElement).value).toBe('120')
    })

    it('offers the four policies and the default, and asks for seconds only for fixed', async () => {
      vi.mocked(fetchScenario).mockResolvedValue(existing)
      const wrapper = mountEdit()
      await flushPromises()
      const select = wrapper.get('[data-testid="boarding-wait-policy"]')
      expect(select.findAll('option').map((option) => option.attributes('value')))
        .toEqual(['default', 'none', 'half_headway', 'full_headway', 'fixed'])
      expect((select.element as HTMLSelectElement).value).toBe('default')
      expect(wrapper.find('[data-testid="boarding-wait-secs"]').exists()).toBe(false)

      await select.setValue('fixed')
      expect(wrapper.find('[data-testid="boarding-wait-secs"]').exists()).toBe(true)
    })

    it('says the boarding wait is charged once, not at every change', async () => {
      const wrapper = mountEdit()
      await flushPromises()
      expect(wrapper.get('[data-testid="boarding-wait-note"]').text())
        .toContain('Charged once, when a trip first boards — not again at each change.')
    })

    // The graph's wait_secs is resolved by the API's compile; what the builder
    // owns is sending the policy and asking for that compile.
    it('PUTs a fixed 300 s boarding wait as {policy: fixed, secs: 300}, then recompiles', async () => {
      vi.mocked(fetchScenario).mockResolvedValue(existing)
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="boarding-wait-policy"]').setValue('fixed')
      await wrapper.get('[data-testid="boarding-wait-secs"]').setValue('300')

      expect((await save(wrapper)).boarding_wait).toEqual({ policy: 'fixed', secs: 300 })
      expect(compileScenario).toHaveBeenCalledWith('ca-hsr', expect.anything())
      expect(vi.mocked(updateScenario).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(compileScenario).mock.invocationCallOrder[0])
    })

    it('drops the seconds when leaving fixed for a headway policy', async () => {
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="boarding-wait-policy"]').setValue('half_headway')

      expect((await save(wrapper)).boarding_wait).toEqual({ policy: 'half_headway' })
    })

    it('sends null to hand the scenario back to the default', async () => {
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="boarding-wait-policy"]').setValue('default')

      expect((await save(wrapper)).boarding_wait).toBeNull()
    })

    // 2147483647 is the top of the API's int4 column.
    it.each([['-5'], ['2.5'], [''], ['2147483648']])('will not save a fixed wait of %j seconds', async (secs) => {
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="boarding-wait-secs"]').setValue(secs)

      expect(wrapper.get('[data-testid="boarding-wait-error"]').text())
        .toBe('Enter the wait in whole seconds, 0 or more.')
      expect(wrapper.get('[data-testid="save-scenario"]').attributes('disabled')).toBeDefined()
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(updateScenario).not.toHaveBeenCalled()
    })

    it.each([[0], [2147483647]])('accepts a fixed wait of %j seconds', async (secs) => {
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="boarding-wait-secs"]').setValue(String(secs))

      expect(wrapper.find('[data-testid="boarding-wait-error"]').exists()).toBe(false)
      expect((await save(wrapper)).boarding_wait).toEqual({ policy: 'fixed', secs })
    })

    it('holds Save, but not yet the alert, when Fixed is chosen with no seconds entered', async () => {
      vi.mocked(fetchScenario).mockResolvedValue(existing)
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="boarding-wait-policy"]').setValue('fixed')

      expect(wrapper.get('[data-testid="save-scenario"]').attributes('disabled')).toBeDefined()
      expect(wrapper.find('[data-testid="boarding-wait-error"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="boarding-wait-secs"]').attributes('aria-invalid')).toBe('false')

      await wrapper.get('[data-testid="boarding-wait-secs"]').trigger('blur')
      expect(wrapper.get('[data-testid="boarding-wait-error"]').text()).toBe('Enter the wait in whole seconds, 0 or more.')
    })

    it('shows the seconds alert once a save is tried, and refuses it', async () => {
      vi.mocked(fetchScenario).mockResolvedValue(existing)
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="boarding-wait-policy"]').setValue('fixed')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('[data-testid="boarding-wait-error"]').exists()).toBe(true)
      expect(updateScenario).not.toHaveBeenCalled()
    })

    it('ties the hint to the policy and the alert to the seconds field', async () => {
      const wrapper = mountEdit()
      await flushPromises()
      const hint = wrapper.get('[data-testid="boarding-wait-note"]')
      expect(wrapper.get('[data-testid="boarding-wait-policy"]').attributes('aria-describedby')).toBe(hint.attributes('id'))

      const secs = wrapper.get('[data-testid="boarding-wait-secs"]')
      expect(secs.attributes('aria-describedby')).toBeUndefined()
      await secs.setValue('-1')
      expect(secs.attributes('aria-invalid')).toBe('true')
      expect(secs.attributes('aria-describedby')).toBe(wrapper.get('[data-testid="boarding-wait-error"]').attributes('id'))
    })

    // The API refuses a pair naming a line outside the network (not_member).
    it('drops the pairs of a line taken out of the network, and says so before saving', async () => {
      const wrapper = mountEdit()
      await flushPromises()
      expect(wrapper.find('[data-testid="dropped-interchanges"]').exists()).toBe(false)

      await wrapper.get('[data-testid="service-checkbox-svc2"]').setValue(false)
      expect(wrapper.get('[data-testid="dropped-interchanges"]').text())
        .toBe('Saving also removes an interchange with a line no longer in this network.')

      const input = await save(wrapper)
      expect(input.service_ids).toEqual(['svc1'])
      expect(input.interchange_pairs).toEqual([])
    })

    // The form is behind the saved notice by then, but the draft is the edit's
    // state: it should hold what the network now is, not the pairs it dropped.
    it('takes the saved scenario as the draft once saved, even when the recompile fails', async () => {
      vi.mocked(compileScenario).mockRejectedValue(new ApiError('compile boom', 500))
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="service-checkbox-svc2"]').setValue(false)
      await save(wrapper)

      expect(wrapper.find('[data-testid="compile-error"]').exists()).toBe(true)
      const vm = wrapper.vm as unknown as {
        editDraft: ScenarioInput
        droppedPairCount: number
        toggleService: (id: string) => void
      }
      expect(vm.editDraft.interchange_pairs).toEqual([])
      expect(vm.droppedPairCount).toBe(0)
      vm.toggleService('svc2')
      expect(vm.editDraft.interchange_pairs).toEqual([])
    })

    it('keeps the pairs of a line taken out and put back', async () => {
      const wrapper = mountEdit()
      await flushPromises()
      await wrapper.get('[data-testid="service-checkbox-svc2"]').setValue(false)
      await wrapper.get('[data-testid="service-checkbox-svc2"]').setValue(true)

      expect((await save(wrapper)).interchange_pairs).toEqual([{ a: union, b: midtown }])
    })
  })

  it('keeps a way back to My authoring while the saved edit recompiles', async () => {
    vi.mocked(compileScenario).mockReturnValue(new Promise(() => {}))
    const wrapper = mountEdit()
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(breadcrumbTrail(wrapper)[0][0]).toBe('My authoring')
    expect(wrapper.findAllComponents(RouterLinkStub)[0].props('to')).toBe('/authoring')
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
      "Some of this network's details weren't accepted. Check them and try again.",
    )
    expect(compileScenario).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
})
