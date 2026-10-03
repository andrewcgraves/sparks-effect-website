import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/admin')>()),
  listUsers: vi.fn(),
  updateUser: vi.fn(),
  createInvite: vi.fn(),
  createResetLink: vi.fn(),
}))

const confirm = vi.fn()
vi.mock('../composables/useConfirm', () => ({ useConfirm: () => ({ confirm }) }))
const toast = vi.fn()
vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: toast }) }))

import AdminPeople from './AdminPeople.vue'
import { createInvite, createResetLink, listUsers, updateUser, type AdminUser } from '../api/admin'
import { ApiError } from '../api/authoring/client'
import { useAuthStore } from '../stores/auth'

const me: AdminUser = {
  id: 'me',
  email: 'me@example.com',
  name: 'Me',
  is_admin: true,
  created_at: '2026-09-01T10:00:00Z',
  disabled_at: null,
  service_count: 2,
  published_count: 1,
}

const bo: AdminUser = {
  id: 'bo',
  email: 'bo@example.com',
  name: 'Bo',
  is_admin: false,
  created_at: '2026-09-15T10:00:00Z',
  disabled_at: null,
  service_count: 5,
  published_count: 3,
}

const cy: AdminUser = {
  ...bo,
  id: 'cy',
  email: 'cy@example.com',
  name: 'Cy',
  disabled_at: '2026-09-20T10:00:00Z',
}

function row(wrapper: VueWrapper, id: string) {
  return wrapper.get(`[data-testid="user-row-${id}"]`)
}

function action(wrapper: VueWrapper, id: string, name: string) {
  return row(wrapper, id).get(`[data-testid="${name}"]`)
}

async function mountPeople(users: AdminUser[] = [me, bo, cy]): Promise<VueWrapper> {
  vi.mocked(listUsers).mockResolvedValue(users)
  const wrapper = mount(AdminPeople)
  await flushPromises()
  return wrapper
}

describe('AdminPeople', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().signIn('tok-1', { id: 'me', email: 'me@example.com', is_admin: true })
    vi.mocked(listUsers).mockReset()
    vi.mocked(updateUser).mockReset().mockResolvedValue({ id: 'x' })
    vi.mocked(createInvite).mockReset()
    vi.mocked(createResetLink).mockReset()
    confirm.mockReset()
    toast.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('the list', () => {
    it('shows each account’s email, name, role, state, created date and counts', async () => {
      const wrapper = await mountPeople()

      const text = row(wrapper, 'bo').text()
      expect(text).toContain('bo@example.com')
      expect(text).toContain('Bo')
      expect(text).toContain('Member')
      expect(text).toContain('Active')
      expect(text).toContain('2026')
      expect(row(wrapper, 'bo').get('[data-testid="service-count"]').text()).toBe('5')
      expect(row(wrapper, 'bo').get('[data-testid="published-count"]').text()).toBe('3')
      expect(row(wrapper, 'me').text()).toContain('Admin')
      expect(row(wrapper, 'cy').text()).toContain('Disabled')
    })

    it('says so when the list can’t be read', async () => {
      vi.mocked(listUsers).mockRejectedValue(new ApiError('boom', 500))
      const wrapper = mount(AdminPeople)
      await flushPromises()

      expect(wrapper.get('[data-testid="people-error"]').attributes('role')).toBe('alert')
    })
  })

  describe('promoting and demoting', () => {
    it('promotes a member, then reads the list again', async () => {
      const wrapper = await mountPeople()

      await action(wrapper, 'bo', 'toggle-admin').trigger('click')
      await flushPromises()

      expect(action(wrapper, 'bo', 'toggle-admin').text()).toBe('Promote')
      expect(updateUser).toHaveBeenCalledWith('bo', { is_admin: true })
      expect(listUsers).toHaveBeenCalledTimes(2)
      expect(toast).toHaveBeenCalledWith('bo@example.com is now an admin')
    })

    it('demotes another admin', async () => {
      const wrapper = await mountPeople([me, { ...bo, is_admin: true }])

      expect(action(wrapper, 'bo', 'toggle-admin').text()).toBe('Demote')
      await action(wrapper, 'bo', 'toggle-admin').trigger('click')
      await flushPromises()

      expect(updateUser).toHaveBeenCalledWith('bo', { is_admin: false })
    })

    it('won’t let an admin demote or disable themselves', async () => {
      const wrapper = await mountPeople()

      expect(action(wrapper, 'me', 'toggle-admin').attributes('disabled')).toBeDefined()
      expect(action(wrapper, 'me', 'toggle-disabled').attributes('disabled')).toBeDefined()
      expect(action(wrapper, 'bo', 'toggle-disabled').attributes('disabled')).toBeUndefined()
    })

    it('reports a refusal without losing the list', async () => {
      vi.mocked(updateUser).mockRejectedValue(new ApiError('nope', 409))
      const wrapper = await mountPeople()

      await action(wrapper, 'bo', 'toggle-admin').trigger('click')
      await flushPromises()

      expect(toast).toHaveBeenCalledWith(expect.any(String), { kind: 'error' })
      expect(wrapper.find('[data-testid="user-row-bo"]').exists()).toBe(true)
    })
  })

  describe('disabling and re-enabling', () => {
    it('asks before disabling, and does nothing if declined', async () => {
      confirm.mockResolvedValue(false)
      const wrapper = await mountPeople()

      await action(wrapper, 'bo', 'toggle-disabled').trigger('click')
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }))
      expect(updateUser).not.toHaveBeenCalled()
    })

    it('disables once confirmed, then reads the list again', async () => {
      confirm.mockResolvedValue(true)
      const wrapper = await mountPeople()

      await action(wrapper, 'bo', 'toggle-disabled').trigger('click')
      await flushPromises()

      expect(updateUser).toHaveBeenCalledWith('bo', { disabled: true })
      expect(listUsers).toHaveBeenCalledTimes(2)
    })

    it('asks before re-enabling too, then enables', async () => {
      confirm.mockResolvedValue(true)
      const wrapper = await mountPeople()

      expect(action(wrapper, 'cy', 'toggle-disabled').text()).toBe('Enable')
      await action(wrapper, 'cy', 'toggle-disabled').trigger('click')
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: false }))
      expect(updateUser).toHaveBeenCalledWith('cy', { disabled: false })
    })
  })

  describe('reset links', () => {
    it('shows the link for one account with its expiry, ready to copy', async () => {
      vi.mocked(createResetLink).mockResolvedValue({ url: 'https://site/set-password?token=r1' })
      const wrapper = await mountPeople()

      await action(wrapper, 'bo', 'reset-link').trigger('click')
      await flushPromises()

      expect(createResetLink).toHaveBeenCalledWith('bo')
      const issued = wrapper.get('[data-testid="issued-link"]')
      expect(issued.text()).toContain('bo@example.com')
      expect(issued.text()).toContain('Expires')
      expect((issued.get('input').element as HTMLInputElement).value).toBe('https://site/set-password?token=r1')
      expect(issued.find('[data-testid="copy-link"]').exists()).toBe(true)
    })

    it('replaces an earlier link with the new one', async () => {
      vi.mocked(createResetLink)
        .mockResolvedValueOnce({ url: 'https://site/a' })
        .mockResolvedValueOnce({ url: 'https://site/b' })
      const wrapper = await mountPeople()

      await action(wrapper, 'bo', 'reset-link').trigger('click')
      await flushPromises()
      await action(wrapper, 'cy', 'reset-link').trigger('click')
      await flushPromises()

      expect(wrapper.findAll('[data-testid="issued-link"]')).toHaveLength(1)
      expect(wrapper.get('[data-testid="issued-link"]').text()).toContain('cy@example.com')
    })
  })

  describe('inviting', () => {
    async function openInvite(wrapper: VueWrapper) {
      await wrapper.get('[data-testid="invite-open"]').trigger('click')
      return wrapper.get('[data-testid="invite-form"]')
    }

    it('creates the account and shows its link, then reads the list again', async () => {
      vi.mocked(createInvite).mockResolvedValue({
        user: { id: 'di', email: 'di@example.com', name: 'Di', is_admin: true },
        url: 'https://site/set-password?token=i1',
      })
      const wrapper = await mountPeople()

      const form = await openInvite(wrapper)
      await form.get('[data-testid="invite-email"]').setValue(' di@example.com ')
      await form.get('[data-testid="invite-name"]').setValue('Di')
      await form.get('[data-testid="invite-admin"]').setValue(true)
      await form.trigger('submit')
      await flushPromises()

      expect(createInvite).toHaveBeenCalledWith({ email: 'di@example.com', name: 'Di', is_admin: true })
      expect(wrapper.find('[data-testid="invite-form"]').exists()).toBe(false)
      const issued = wrapper.get('[data-testid="issued-link"]')
      expect(issued.text()).toContain('di@example.com')
      expect((issued.get('input').element as HTMLInputElement).value).toBe('https://site/set-password?token=i1')
      expect(listUsers).toHaveBeenCalledTimes(2)
    })

    it('keeps the form open with the reason when the email is taken', async () => {
      vi.mocked(createInvite).mockRejectedValue(new ApiError('taken', 409))
      const wrapper = await mountPeople()

      const form = await openInvite(wrapper)
      await form.get('[data-testid="invite-email"]').setValue('bo@example.com')
      await form.trigger('submit')
      await flushPromises()

      expect(wrapper.get('[data-testid="invite-error"]').text()).toContain('already')
      expect(wrapper.find('[data-testid="issued-link"]').exists()).toBe(false)
    })

    it('can be cancelled', async () => {
      const wrapper = await mountPeople()

      await openInvite(wrapper)
      await wrapper.get('[data-testid="invite-cancel"]').trigger('click')

      expect(wrapper.find('[data-testid="invite-form"]').exists()).toBe(false)
      expect(createInvite).not.toHaveBeenCalled()
    })
  })
})
