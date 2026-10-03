import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '../api/authoring/client'
import type { PublicationSnapshot, ServicePublication } from '../api/publications'

vi.mock('../api/publications', () => ({
  fetchServicePublication: vi.fn(),
  publishService: vi.fn(),
  unpublishService: vi.fn(),
}))

import PublicationControl from './PublicationControl.vue'
import { fetchServicePublication, publishService, unpublishService } from '../api/publications'
import { PUBLISH_COMPILE_FAILED } from '../composables/usePublication'
import { mountSharedHosts } from '../test/sharedHosts'

const Stub = { template: '<div>stub</div>' }

const PUBLISHED_AT = '2026-09-20T12:00:00.123456Z'
const BEFORE = '2026-09-20T11:00:00Z'
const AFTER = '2026-09-21T08:00:00Z'

function snapshot(publishedAt = PUBLISHED_AT): PublicationSnapshot {
  return { user_service_id: 'svc1', compile_job_id: 'job1', name: 'Northbound Express', routes: [], published_at: publishedAt }
}

function mountControl(props: { updatedAt?: string, compiling?: boolean, recompile?: (slug: string) => Promise<boolean> } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/services/:slug', name: 'published-service', component: Stub }],
  })
  return mount(PublicationControl, {
    props: {
      slug: 'northbound-express',
      updatedAt: BEFORE,
      compiling: false,
      recompile: vi.fn().mockResolvedValue(true),
      ...props,
    },
    global: { plugins: [router] },
  })
}

function unpublished(): void {
  vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('not found', 404))
}

function published(): void {
  vi.mocked(fetchServicePublication).mockResolvedValue(snapshot() as ServicePublication)
}

describe('PublicationControl', () => {
  let hosts: ReturnType<typeof mountSharedHosts>

  beforeEach(() => {
    hosts = mountSharedHosts()
    vi.mocked(fetchServicePublication).mockReset()
    vi.mocked(publishService).mockReset()
    vi.mocked(unpublishService).mockReset()
  })

  afterEach(() => {
    hosts.unmount()
    vi.unstubAllGlobals()
  })

  it('offers no action until it knows whether the service is published', () => {
    vi.mocked(fetchServicePublication).mockReturnValue(new Promise(() => {}))
    const wrapper = mountControl()
    expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('checking')
    expect(wrapper.find('[data-testid="publish-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="unpublish-button"]').exists()).toBe(false)
  })

  it('says so, and offers no action, when the publication cannot be read', async () => {
    vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('boom', 500))
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('[data-testid="publication-check-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="publish-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="unpublish-button"]').exists()).toBe(false)
  })

  describe('unpublished', () => {
    it('offers to publish, and nothing else', async () => {
      unpublished()
      const wrapper = mountControl()
      await flushPromises()
      expect(wrapper.get('[data-testid="publication-status"]').text()).toContain('Not published')
      expect(wrapper.get('[data-testid="publish-button"]').text()).toBe('Publish')
      expect(wrapper.find('[data-testid="unpublish-button"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="public-url"]').exists()).toBe(false)
    })

    it('publishes, then shows the public URL', async () => {
      unpublished()
      vi.mocked(publishService).mockResolvedValue(snapshot('2026-09-21T09:00:00Z'))
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="publish-button"]').trigger('click')
      await flushPromises()
      expect(publishService).toHaveBeenCalledWith('northbound-express')
      expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('current')
      expect(wrapper.get('[data-testid="public-url"]').text()).toBe(`${window.location.origin}/services/northbound-express`)
    })

    it('reads "Publishing…" and cannot be clicked again while it publishes', async () => {
      unpublished()
      vi.mocked(publishService).mockReturnValue(new Promise(() => {}))
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="publish-button"]').trigger('click')
      const button = wrapper.get('[data-testid="publish-button"]')
      expect(button.text()).toBe('Publishing…')
      expect(button.attributes('disabled')).toBeDefined()
    })

    it('waits out a compile the page already has running', async () => {
      unpublished()
      const wrapper = mountControl({ compiling: true })
      await flushPromises()
      expect(wrapper.get('[data-testid="publish-button"]').attributes('disabled')).toBeDefined()
    })

    it('reports a compile fault and stays unpublished', async () => {
      unpublished()
      vi.mocked(publishService).mockRejectedValue(new ApiError('stale', 409, 'stale_graph'))
      const recompile = vi.fn().mockResolvedValue(false)
      const wrapper = mountControl({ recompile })
      await flushPromises()
      await wrapper.get('[data-testid="publish-button"]').trigger('click')
      await flushPromises()
      expect(recompile).toHaveBeenCalledWith('northbound-express')
      expect(wrapper.get('[data-testid="publication-error"]').text()).toBe(PUBLISH_COMPILE_FAILED)
      expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('unpublished')
      expect(wrapper.get('[data-testid="publish-button"]').attributes('disabled')).toBeUndefined()
    })
  })

  describe('published and current', () => {
    it('shows when it was published and the public URL, and offers only to unpublish', async () => {
      published()
      const wrapper = mountControl({ updatedAt: BEFORE })
      await flushPromises()
      expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('current')
      expect(wrapper.get('time').attributes('datetime')).toBe(PUBLISHED_AT)
      expect(wrapper.get('[data-testid="publication-status"]').text()).toContain('Visitors see this service as it is now')
      const link = wrapper.get('[data-testid="public-url"]')
      expect(link.attributes('href')).toBe('/services/northbound-express')
      expect(link.text()).toBe(`${window.location.origin}/services/northbound-express`)
      expect(wrapper.find('[data-testid="publish-button"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="unpublish-button"]').exists()).toBe(true)
    })

    it('copies the public URL', async () => {
      published()
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="copy-public-url"]').trigger('click')
      await flushPromises()
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/services/northbound-express`)
      expect(wrapper.get('[data-testid="copy-public-url"]').text()).toBe('Copied')
    })

    it('falls back to selecting the link by hand when there is no clipboard', async () => {
      published()
      vi.stubGlobal('navigator', {})
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="copy-public-url"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="copy-public-url-failed"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="copy-public-url"]').text()).toBe('Copy link')
    })
  })

  describe('published with unpublished changes', () => {
    it('says the edits are not public yet and offers to republish', async () => {
      published()
      const wrapper = mountControl({ updatedAt: AFTER })
      await flushPromises()
      expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('changed')
      expect(wrapper.get('[data-testid="publication-unpublished-changes"]').text()).toContain('until you republish')
      expect(wrapper.get('[data-testid="publish-button"]').text()).toBe('Republish')
      expect(wrapper.find('[data-testid="unpublish-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="public-url"]').exists()).toBe(true)
    })

    it('becomes current once republished', async () => {
      published()
      vi.mocked(publishService).mockResolvedValue(snapshot('2026-09-22T09:00:00Z'))
      const wrapper = mountControl({ updatedAt: AFTER })
      await flushPromises()
      await wrapper.get('[data-testid="publish-button"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('current')
    })

    it('keeps the earlier publication, and says why, when a republish fails', async () => {
      published()
      vi.mocked(publishService).mockRejectedValue(new ApiError('PUT failed: 500: internal error', 500))
      const wrapper = mountControl({ updatedAt: AFTER })
      await flushPromises()
      await wrapper.get('[data-testid="publish-button"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-testid="publication-error"]').text()).toBe(
        "Not published: couldn't reach the server. Your draft is saved; try again.",
      )
      expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('changed')
      expect(wrapper.get('time').attributes('datetime')).toBe(PUBLISHED_AT)
    })
  })

  describe('toasts', () => {
    it('says "Published" once published', async () => {
      unpublished()
      vi.mocked(publishService).mockResolvedValue(snapshot('2026-09-21T09:00:00Z'))
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="publish-button"]').trigger('click')
      await flushPromises()
      expect(hosts.toasts()).toEqual(['Published'])
    })

    it('says "Republished" once republished', async () => {
      published()
      vi.mocked(publishService).mockResolvedValue(snapshot('2026-09-22T09:00:00Z'))
      const wrapper = mountControl({ updatedAt: AFTER })
      await flushPromises()
      await wrapper.get('[data-testid="publish-button"]').trigger('click')
      await flushPromises()
      expect(hosts.toasts()).toEqual(['Republished'])
    })

    it('says nothing when publishing fails', async () => {
      unpublished()
      vi.mocked(publishService).mockRejectedValue(new ApiError('PUT failed: 500', 500))
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="publish-button"]').trigger('click')
      await flushPromises()
      expect(hosts.toasts()).toEqual([])
    })

    it('says "Unpublished" once unpublished', async () => {
      published()
      vi.mocked(unpublishService).mockResolvedValue(undefined)
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="unpublish-button"]').trigger('click')
      await flushPromises()
      await hosts.confirmButton().trigger('click')
      await flushPromises()
      expect(hosts.toasts()).toEqual(['Unpublished'])
    })

    it('says nothing when unpublishing is backed out of or fails', async () => {
      published()
      vi.mocked(unpublishService).mockRejectedValue(new ApiError('DELETE failed: 500', 500))
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="unpublish-button"]').trigger('click')
      await flushPromises()
      await hosts.cancelButton().trigger('click')
      await flushPromises()
      await wrapper.get('[data-testid="unpublish-button"]').trigger('click')
      await flushPromises()
      await hosts.confirmButton().trigger('click')
      await flushPromises()
      expect(hosts.toasts()).toEqual([])
    })
  })

  describe('unpublishing', () => {
    it('asks first, and does nothing until confirmed', async () => {
      published()
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="unpublish-button"]').trigger('click')
      await flushPromises()
      expect(unpublishService).not.toHaveBeenCalled()
      expect(hosts.dialogOpen()).toBe(true)
      expect(hosts.dialog().text()).toContain('stop working')
    })

    it('can be backed out of', async () => {
      published()
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="unpublish-button"]').trigger('click')
      await flushPromises()
      await hosts.cancelButton().trigger('click')
      await flushPromises()
      expect(unpublishService).not.toHaveBeenCalled()
      expect(hosts.dialogOpen()).toBe(false)
      expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('current')
    })

    it('unpublishes once confirmed', async () => {
      published()
      vi.mocked(unpublishService).mockResolvedValue(undefined)
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="unpublish-button"]').trigger('click')
      await flushPromises()
      await hosts.confirmButton().trigger('click')
      await flushPromises()
      expect(unpublishService).toHaveBeenCalledWith('northbound-express')
      expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('unpublished')
      expect(hosts.dialogOpen()).toBe(false)
      expect(wrapper.find('[data-testid="public-url"]').exists()).toBe(false)
    })

    it('stays published, and says why, when unpublishing fails', async () => {
      published()
      vi.mocked(unpublishService).mockRejectedValue(new ApiError('DELETE failed: 500', 500))
      const wrapper = mountControl()
      await flushPromises()
      await wrapper.get('[data-testid="unpublish-button"]').trigger('click')
      await flushPromises()
      await hosts.confirmButton().trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-testid="publication-error"]').text()).toBe(
        "Still published: couldn't reach the server. Your draft is saved; try again.",
      )
      expect(wrapper.get('[data-testid="publication"]').attributes('data-state')).toBe('current')
    })
  })
})
