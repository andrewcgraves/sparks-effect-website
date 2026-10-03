import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, SessionExpiredError } from '../api/authoring/client'
import type { Scenario } from '../api/authoring/types'

vi.mock('../api/authoring/services', () => ({ deleteService: vi.fn() }))
vi.mock('../api/authoring/scenarios', () => ({ deleteScenario: vi.fn(), fetchMyScenarios: vi.fn() }))
vi.mock('../api/publications', () => ({ fetchServicePublication: vi.fn() }))

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import { serviceDeletionBody, useScenarioDeletion, useServiceDeletion } from './useDeletion'
import { useConfirmHost } from './useConfirm'
import { useToastHost } from './useToast'
import { deleteService } from '../api/authoring/services'
import { deleteScenario, fetchMyScenarios } from '../api/authoring/scenarios'
import { fetchServicePublication } from '../api/publications'
import type { ServicePublication } from '../api/publications'

const coastExpress = { id: 'svc1', slug: 'coast-express', name: 'Coast Express' }

function scenarioWith(id: string, serviceIds: string[]): Scenario {
  return { id, slug: id, name: id, description: '', service_ids: serviceIds }
}

const { pending, settle } = useConfirmHost()
const { toasts, clear } = useToastHost()

// The confirm opens once its consequences are gathered, so wait for it rather
// than for a fixed number of ticks.
async function answer(confirmed: boolean): Promise<void> {
  await vi.waitFor(() => expect(pending.value).not.toBeNull())
  settle(confirmed)
}

describe('serviceDeletionBody', () => {
  it('names the compile history alone when the service is in no scenario and unpublished', () => {
    expect(serviceDeletionBody({ scenarioCount: 0, published: false }))
      .toBe("Its compile history goes too. This can't be undone.")
  })

  it('counts the scenarios it will be removed from', () => {
    expect(serviceDeletionBody({ scenarioCount: 1, published: false }))
      .toBe("Its compile history goes too, and it will be removed from 1 scenario. This can't be undone.")
    expect(serviceDeletionBody({ scenarioCount: 2, published: false }))
      .toBe("Its compile history goes too, and it will be removed from 2 scenarios. This can't be undone.")
  })

  it('warns that a published service takes its public page with it', () => {
    expect(serviceDeletionBody({ scenarioCount: 0, published: true }))
      .toBe("Its compile history goes too. Its public page will stop working. This can't be undone.")
  })

  it('still warns, conditionally, when neither count nor publication could be checked', () => {
    expect(serviceDeletionBody({ scenarioCount: null, published: null })).toBe(
      "Its compile history goes too, and it will be removed from any scenario it's in. "
      + "If it's published, its public page will stop working. This can't be undone.",
    )
  })
})

describe('useServiceDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clear()
    vi.mocked(fetchMyScenarios).mockResolvedValue([
      scenarioWith('a', ['svc1', 'svc9']),
      scenarioWith('b', ['svc9']),
      scenarioWith('c', ['svc1']),
    ])
    vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('no publication', 404, 'not_found'))
    vi.mocked(deleteService).mockResolvedValue()
  })

  afterEach(() => settle(false))

  it('looks up its scenarios and publication before asking', async () => {
    const { confirmAndDelete } = useServiceDeletion()
    void confirmAndDelete(coastExpress)
    await vi.waitFor(() => expect(pending.value).not.toBeNull())
    expect(fetchMyScenarios).toHaveBeenCalledTimes(1)
    expect(fetchServicePublication).toHaveBeenCalledWith('coast-express')
  })

  it('shows a destructive confirm with the scenario count and no public-page warning when unpublished', async () => {
    const { confirmAndDelete } = useServiceDeletion()
    void confirmAndDelete(coastExpress)
    await vi.waitFor(() => expect(pending.value).not.toBeNull())
    expect(pending.value).toMatchObject({
      title: "Delete 'Coast Express'?",
      body: "Its compile history goes too, and it will be removed from 2 scenarios. This can't be undone.",
      confirmLabel: 'Delete service',
      destructive: true,
    })
  })

  it('warns when the service is published', async () => {
    vi.mocked(fetchServicePublication).mockResolvedValue({ published_at: '2026-09-01T00:00:00Z' } as ServicePublication)
    const { confirmAndDelete } = useServiceDeletion()
    void confirmAndDelete(coastExpress)
    await vi.waitFor(() => expect(pending.value).not.toBeNull())
    expect(pending.value?.body).toContain('Its public page will stop working.')
  })

  it('deletes nothing when declined', async () => {
    const { confirmAndDelete } = useServiceDeletion()
    const done = confirmAndDelete(coastExpress)
    await answer(false)
    expect(await done).toBe(false)
    expect(deleteService).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('deletes, toasts and goes to My authoring when confirmed', async () => {
    const { confirmAndDelete } = useServiceDeletion()
    const done = confirmAndDelete(coastExpress)
    await answer(true)
    expect(await done).toBe(true)
    expect(deleteService).toHaveBeenCalledWith('coast-express')
    expect(toasts.value.map((t) => t.message)).toEqual(["Deleted 'Coast Express'"])
    expect(push).toHaveBeenCalledWith('/authoring')
  })

  it('stays put and toasts the reason when the delete fails', async () => {
    vi.mocked(deleteService).mockRejectedValue(new ApiError('boom', 500, 'internal'))
    const { confirmAndDelete, deleting } = useServiceDeletion()
    const done = confirmAndDelete(coastExpress)
    await answer(true)
    expect(await done).toBe(false)
    expect(push).not.toHaveBeenCalled()
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0]).toMatchObject({ kind: 'error' })
    expect(toasts.value[0].message).toMatch(/^Not deleted: /)
    expect(deleting.value).toBe(false)
  })

  it('toasts nothing when the session expired mid-delete, since sign-in is already on its way', async () => {
    vi.mocked(deleteService).mockRejectedValue(new SessionExpiredError('DELETE failed: 401'))
    const { confirmAndDelete } = useServiceDeletion()
    const done = confirmAndDelete(coastExpress)
    await answer(true)
    expect(await done).toBe(false)
    expect(toasts.value).toHaveLength(0)
    expect(push).not.toHaveBeenCalled()
  })

  it('is busy from the first click until the delete settles, and ignores a second click', async () => {
    let finish: () => void = () => {}
    vi.mocked(deleteService).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { confirmAndDelete, deleting } = useServiceDeletion()
    const done = confirmAndDelete(coastExpress)
    expect(deleting.value).toBe(true)
    expect(await confirmAndDelete(coastExpress)).toBe(false)
    await answer(true)
    await vi.waitFor(() => expect(deleteService).toHaveBeenCalled())
    expect(deleting.value).toBe(true)
    finish()
    await done
    expect(deleting.value).toBe(false)
  })
})

describe('useScenarioDeletion', () => {
  const caHsr = { id: 's1', slug: 'ca-hsr', name: 'CA HSR' }

  beforeEach(() => {
    vi.clearAllMocks()
    clear()
    vi.mocked(deleteScenario).mockResolvedValue()
  })

  afterEach(() => settle(false))

  it('asks first, saying its services stay', async () => {
    const { confirmAndDelete } = useScenarioDeletion()
    void confirmAndDelete(caHsr)
    await vi.waitFor(() => expect(pending.value).not.toBeNull())
    expect(pending.value).toMatchObject({
      title: "Delete 'CA HSR'?",
      body: "Its compiled graph goes too. Its services aren't deleted. This can't be undone.",
      confirmLabel: 'Delete scenario',
      destructive: true,
    })
  })

  it('deletes, toasts and goes to My authoring when confirmed', async () => {
    const { confirmAndDelete } = useScenarioDeletion()
    const done = confirmAndDelete(caHsr)
    await answer(true)
    expect(await done).toBe(true)
    expect(deleteScenario).toHaveBeenCalledWith('ca-hsr')
    expect(toasts.value.map((t) => t.message)).toEqual(["Deleted 'CA HSR'"])
    expect(push).toHaveBeenCalledWith('/authoring')
  })
})
