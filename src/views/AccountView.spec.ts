import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AccountView from './AccountView.vue'
import { useAuthStore } from '../stores/auth'
import { setAuthTokenProvider, setUnauthorizedHandler } from '../api/authoring'
import { mountSharedHosts } from '../test/sharedHosts'

const Stub = { template: '<div />' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/account', name: 'account', component: AccountView },
      { path: '/authoring', name: 'authoring', component: Stub },
      { path: '/login', name: 'login', component: Stub },
    ],
  })
}

function respond(status: number, body?: unknown): Response {
  return { ok: status < 400, status, json: async () => body } as Response
}

function sentTo(index: number): { url: string, init: RequestInit } {
  const [url, init] = vi.mocked(fetch).mock.calls[index]
  return { url: String(url), init: init as RequestInit }
}

describe('AccountView', () => {
  let hosts: ReturnType<typeof mountSharedHosts>

  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    hosts = mountSharedHosts()
  })

  afterEach(() => {
    hosts.unmount()
    setAuthTokenProvider(null)
    setUnauthorizedHandler(null)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function mountAccount() {
    const router = makeRouter()
    const auth = useAuthStore()
    auth.signIn('tok-1', { id: 'u1', email: 'a@example.com', name: 'Bootstrap Admin' })
    setAuthTokenProvider(() => auth.token)
    setUnauthorizedHandler((sent) => {
      if (auth.token === sent) auth.expireSession()
    })
    await router.push('/account')
    const wrapper = mount(AccountView, { global: { plugins: [router] }, attachTo: document.body })
    return { wrapper, router, auth }
  }

  describe('profile', () => {
    it('starts from the current name and says where it will appear', async () => {
      const { wrapper } = await mountAccount()
      expect((wrapper.get('[data-testid="name"]').element as HTMLInputElement).value).toBe('Bootstrap Admin')
      expect(wrapper.get('[data-testid="profile"]').text()).toContain('published pages')
      expect(wrapper.get('[data-testid="signed-in-as"]').text()).toContain('Bootstrap Admin')
    })

    it('saves a new name and updates the signed-in line without a reload', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(respond(200, { id: 'u1', email: 'a@example.com', name: 'Ada' }))
      const { wrapper } = await mountAccount()

      await wrapper.get('[data-testid="name"]').setValue('Ada')
      await wrapper.get('[data-testid="profile-form"]').trigger('submit')
      await flushPromises()

      const { url, init } = sentTo(0)
      expect(url).toContain('/api/auth/me')
      expect(init.method).toBe('PATCH')
      expect(wrapper.get('[data-testid="signed-in-as"]').text()).toContain('Ada')
      expect(hosts.toasts()).toContain('Name saved')
    })

    it('shows why a name was refused', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        respond(422, { code: 'validation', detail: { faults: [{ field: 'name', rule: 'max_length' }] } }),
      )
      const { wrapper } = await mountAccount()

      await wrapper.get('[data-testid="name"]').setValue('Ada')
      await wrapper.get('[data-testid="profile-form"]').trigger('submit')
      await flushPromises()

      expect(wrapper.get('[data-testid="profile-error"]').text()).toBe('Your name can be at most 80 characters.')
    })

    it('offers no save until the name is changed and not blank', async () => {
      const { wrapper } = await mountAccount()
      const save = () => wrapper.get('[data-testid="save-name"]').element as HTMLButtonElement
      expect(save().disabled).toBe(true)

      await wrapper.get('[data-testid="name"]').setValue('   ')
      expect(save().disabled).toBe(true)

      await wrapper.get('[data-testid="name"]').setValue('Ada')
      expect(save().disabled).toBe(false)
    })
  })

  describe('password', () => {
    async function submitPassword(wrapper: Awaited<ReturnType<typeof mountAccount>>['wrapper'], next = 'a-long-new-password') {
      await wrapper.get('[data-testid="current-password"]').setValue('old-password')
      await wrapper.get('[data-testid="new-password"]').setValue(next)
      await wrapper.get('[data-testid="password-form"]').trigger('submit')
      await flushPromises()
    }

    it('states the policy beside the field', async () => {
      const { wrapper } = await mountAccount()
      expect(wrapper.get('[data-testid="password-policy"]').text()).toContain('at least 12 characters')
    })

    it('changes the password, clears the fields and says other devices were signed out', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(respond(204))
      const { wrapper, auth } = await mountAccount()

      await submitPassword(wrapper)

      expect(JSON.parse(sentTo(0).init.body as string)).toEqual({
        current_password: 'old-password',
        new_password: 'a-long-new-password',
      })
      expect(wrapper.get('[data-testid="password-changed"]').text()).toContain('other devices')
      expect((wrapper.get('[data-testid="current-password"]').element as HTMLInputElement).value).toBe('')
      expect((wrapper.get('[data-testid="new-password"]').element as HTMLInputElement).value).toBe('')
      expect(auth.isAuthenticated).toBe(true)
    })

    it('says so when the current password is wrong, and stays signed in', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(respond(401, { error: 'current password is incorrect' }))
        .mockResolvedValueOnce(respond(200, { id: 'u1', email: 'a@example.com' }))
      const { wrapper, router, auth } = await mountAccount()

      await submitPassword(wrapper)

      expect(wrapper.get('[data-testid="password-error"]').text()).toBe('Your current password is incorrect.')
      expect(auth.isAuthenticated).toBe(true)
      expect(router.currentRoute.value.path).toBe('/account')
    })

    it('says what is wrong with a weak new password', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        respond(422, { code: 'validation', detail: { faults: [{ field: 'new_password', rule: 'min_length' }] } }),
      )
      const { wrapper } = await mountAccount()

      await submitPassword(wrapper, 'short')

      expect(wrapper.get('[data-testid="password-error"]').text()).toBe(
        'Your new password must be at least 12 characters.',
      )
      expect(wrapper.find('[data-testid="password-changed"]').exists()).toBe(false)
    })
  })

  describe('sessions', () => {
    it('signs out of this device and goes to sign in', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(respond(204))
      const { wrapper, router, auth } = await mountAccount()

      await wrapper.get('[data-testid="sign-out"]').trigger('click')
      await flushPromises()

      expect(sentTo(0).url).toContain('/api/auth/logout')
      expect(auth.isAuthenticated).toBe(false)
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('asks before signing out everywhere, and does nothing if declined', async () => {
      const { wrapper, router, auth } = await mountAccount()

      await wrapper.get('[data-testid="sign-out-everywhere"]').trigger('click')
      await flushPromises()
      expect(hosts.dialogOpen()).toBe(true)

      await hosts.cancelButton().trigger('click')
      await flushPromises()

      expect(fetch).not.toHaveBeenCalled()
      expect(auth.isAuthenticated).toBe(true)
      expect(router.currentRoute.value.path).toBe('/account')
    })

    it('revokes every session once confirmed, then goes to sign in', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(respond(204))
      const { wrapper, router, auth } = await mountAccount()

      await wrapper.get('[data-testid="sign-out-everywhere"]').trigger('click')
      await flushPromises()
      await hosts.confirmButton().trigger('click')
      await flushPromises()

      expect(sentTo(0).url).toContain('/api/auth/sessions/revoke-all')
      expect(auth.isAuthenticated).toBe(false)
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('stays put and says so when signing out everywhere fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(respond(500, {}))
      const { wrapper, router, auth } = await mountAccount()

      await wrapper.get('[data-testid="sign-out-everywhere"]').trigger('click')
      await flushPromises()
      await hosts.confirmButton().trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-testid="sessions-error"]').text()).not.toBe('')
      expect(auth.isAuthenticated).toBe(true)
      expect(router.currentRoute.value.path).toBe('/account')
    })
  })
})
