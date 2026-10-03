import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterLinkStub, flushPromises, mount, type VueWrapper } from '@vue/test-utils'

vi.mock('../api/publications', () => ({
  listPublishedServices: vi.fn(),
  unpublishService: vi.fn(),
}))

const confirmWithNote = vi.fn()
vi.mock('../composables/useConfirm', () => ({ useConfirm: () => ({ confirmWithNote }) }))
const toast = vi.fn()
vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: toast }) }))

import AdminPublished from './AdminPublished.vue'
import { listPublishedServices, unpublishService } from '../api/publications'
import { ApiError } from '../api/authoring/client'

const coast = { slug: 'coast-line', name: 'Coast Line' }
const bay = { slug: 'bay-loop', name: 'Bay Loop' }
const ridge = { slug: 'ridge-express', name: 'Ridge Express' }

async function mountPublished(): Promise<VueWrapper> {
  const wrapper = mount(AdminPublished, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return wrapper
}

function row(wrapper: VueWrapper, slug: string) {
  return wrapper.get(`[data-testid="published-row-${slug}"]`)
}

describe('AdminPublished', () => {
  beforeEach(() => {
    vi.mocked(listPublishedServices).mockReset().mockResolvedValue({ items: [coast, bay], next_cursor: null })
    vi.mocked(unpublishService).mockReset().mockResolvedValue(undefined)
    confirmWithNote.mockReset()
    toast.mockReset()
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists every published service by name and slug, each opening its public page', async () => {
    const wrapper = await mountPublished()

    expect(row(wrapper, 'coast-line').text()).toContain('Coast Line')
    expect(row(wrapper, 'coast-line').text()).toContain('coast-line')
    expect(row(wrapper, 'bay-loop').getComponent(RouterLinkStub).props('to')).toEqual({ name: 'published-service', params: { slug: 'bay-loop' } })
  })

  it('reads further pages on request', async () => {
    vi.mocked(listPublishedServices)
      .mockResolvedValueOnce({ items: [coast, bay], next_cursor: 'c1' })
      .mockResolvedValueOnce({ items: [ridge], next_cursor: null })
    const wrapper = await mountPublished()

    await wrapper.get('[data-testid="published-more"]').trigger('click')
    await flushPromises()

    expect(listPublishedServices).toHaveBeenLastCalledWith({ cursor: 'c1', limit: 100 })
    expect(wrapper.find('[data-testid="published-row-ridge-express"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="published-row-coast-line"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="published-more"]').exists()).toBe(false)
  })

  it('says when nothing is published', async () => {
    vi.mocked(listPublishedServices).mockResolvedValue({ items: [], next_cursor: null })
    const wrapper = await mountPublished()

    expect(wrapper.find('[data-testid="published-empty"]').exists()).toBe(true)
  })

  it('says so when the index can’t be read', async () => {
    vi.mocked(listPublishedServices).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = await mountPublished()

    expect(wrapper.get('[data-testid="published-error"]').attributes('role')).toBe('alert')
  })

  describe('unpublishing', () => {
    it('asks first, with a reason, and does nothing if declined', async () => {
      confirmWithNote.mockResolvedValue(null)
      const wrapper = await mountPublished()

      await row(wrapper, 'coast-line').get('[data-testid="unpublish"]').trigger('click')
      await flushPromises()

      expect(confirmWithNote).toHaveBeenCalledWith(expect.objectContaining({ destructive: true, noteLabel: expect.any(String) }))
      expect(unpublishService).not.toHaveBeenCalled()
    })

    it('unpublishes once confirmed, logs the reason, and reads the index again', async () => {
      confirmWithNote.mockResolvedValue('Reported as spam')
      const wrapper = await mountPublished()

      await row(wrapper, 'coast-line').get('[data-testid="unpublish"]').trigger('click')
      await flushPromises()

      expect(unpublishService).toHaveBeenCalledWith('coast-line')
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('unpublish'),
        expect.objectContaining({ slug: 'coast-line', reason: 'Reported as spam' }),
      )
      expect(toast).toHaveBeenCalledWith('Coast Line is unpublished')
      expect(listPublishedServices).toHaveBeenCalledTimes(2)
    })

    it('reports a failure and keeps the row', async () => {
      confirmWithNote.mockResolvedValue('')
      vi.mocked(unpublishService).mockRejectedValue(new ApiError('nope', 500))
      const wrapper = await mountPublished()

      await row(wrapper, 'coast-line').get('[data-testid="unpublish"]').trigger('click')
      await flushPromises()

      expect(toast).toHaveBeenCalledWith(expect.any(String), { kind: 'error' })
      expect(console.info).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="published-row-coast-line"]').exists()).toBe(true)
    })
  })
})
