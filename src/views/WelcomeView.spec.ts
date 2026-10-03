import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import WelcomeView from './WelcomeView.vue'
import { useAuthStore } from '../stores/auth'

const AuthoringStub = { template: '<div>authoring</div>' }

const EXPIRED_COPY = 'This link has expired or has already been used. Ask an admin for a new one.'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/welcome/:token', name: 'welcome', component: WelcomeView, props: true },
      { path: '/authoring', name: 'authoring', component: AuthoringStub },
    ],
  })
}

function respond(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body, headers: new Headers() } as Response
}

function linkFor(purpose: 'invite' | 'reset', email = 'new@example.com') {
  return respond(200, { purpose, email, expires_at: '2026-10-10T00:00:00Z' })
}

const SESSION = {
  token: 'session-1',
  expires_at: '2026-10-04T00:00:00Z',
  user: { id: 'u-new', email: 'new@example.com', is_admin: false },
}

async function open(token = 'tok-1') {
  const router = makeRouter()
  await router.push(`/welcome/${token}`)
  const wrapper = mount(WelcomeView, { props: { token }, global: { plugins: [router] } })
  await flushPromises()
  return { router, wrapper }
}

async function choose(wrapper: Awaited<ReturnType<typeof open>>['wrapper'], password: string, confirm = password) {
  await wrapper.find('input[data-testid="new-password"]').setValue(password)
  await wrapper.find('input[data-testid="confirm-password"]').setValue(confirm)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('WelcomeView', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('an invite link', () => {
    it('greets the invitee by email and states the password policy', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(linkFor('invite'))
      const { wrapper } = await open()

      expect(wrapper.find('h1').text()).toBe('Welcome to Sparks Effect')
      const email = wrapper.find('input[data-testid="email"]')
      expect((email.element as HTMLInputElement).value).toBe('new@example.com')
      expect((email.element as HTMLInputElement).readOnly).toBe(true)
      expect(wrapper.find('[data-testid="password-policy"]').text()).toContain('At least 12 characters')
    })

    it('sets the password and lands the invitee on /authoring, signed in', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(linkFor('invite')).mockResolvedValueOnce(respond(200, SESSION))
      const { router, wrapper } = await open()

      await choose(wrapper, 'a-strong-new-password')

      const [url, init] = vi.mocked(fetch).mock.calls[1]
      expect(url).toContain('/api/auth/tokens/tok-1')
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ password: 'a-strong-new-password' })
      expect(router.currentRoute.value.path).toBe('/authoring')
      const auth = useAuthStore()
      expect(auth.token).toBe('session-1')
      expect(auth.userId).toBe('u-new')
    })
  })

  describe('a reset link', () => {
    it('asks for a new password', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(linkFor('reset'))
      const { wrapper } = await open()

      expect(wrapper.find('h1').text()).toBe('Choose a new password')
    })
  })

  describe('a link that no longer works', () => {
    it('says so and shows no form', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(respond(404, { error: 'link not found or no longer valid' }))
      const { wrapper } = await open()

      expect(wrapper.find('[data-testid="link-expired"]').text()).toBe(EXPIRED_COPY)
      expect(wrapper.find('form').exists()).toBe(false)
    })

    it('says so when the link is used up between opening and submitting', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(linkFor('invite'))
        .mockResolvedValueOnce(respond(404, { error: 'link not found or no longer valid' }))
      const { router, wrapper } = await open()

      await choose(wrapper, 'a-strong-new-password')

      expect(wrapper.find('[data-testid="link-expired"]').text()).toBe(EXPIRED_COPY)
      expect(wrapper.find('form').exists()).toBe(false)
      expect(router.currentRoute.value.name).toBe('welcome')
    })
  })

  it('reports a failure to load the link without calling it expired', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { wrapper } = await open()

    expect(wrapper.find('[data-testid="link-expired"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain('try again')
  })

  describe('a password the policy rejects', () => {
    it('shows the policy message, keeps the form, and does not sign in', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(linkFor('invite')).mockResolvedValueOnce(respond(422, {
        error: 'password must be at least 12 characters',
        code: 'validation',
        detail: { faults: [{ field: 'password', rule: 'min_length', message: 'password must be at least 12 characters' }] },
      }))
      const { router, wrapper } = await open()

      await choose(wrapper, 'short')

      expect(wrapper.find('[data-testid="password-error"]').text()).toBe('Use at least 12 characters.')
      expect(wrapper.find('form').exists()).toBe(true)
      expect(router.currentRoute.value.name).toBe('welcome')
      expect(useAuthStore().isAuthenticated).toBe(false)
    })

    it('leaves the link usable, so a stronger password still goes through', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(linkFor('invite'))
        .mockResolvedValueOnce(respond(422, {
          code: 'validation',
          detail: { faults: [{ field: 'password', rule: 'min_length', message: 'x' }] },
        }))
        .mockResolvedValueOnce(respond(200, SESSION))
      const { router, wrapper } = await open()

      await choose(wrapper, 'short')
      await choose(wrapper, 'a-strong-new-password')

      expect(router.currentRoute.value.path).toBe('/authoring')
      expect(useAuthStore().token).toBe('session-1')
    })

    it.each([
      ['common', 'That password is too common. Choose something harder to guess.'],
      ['matches_email', "Your password can't be your email address."],
      ['max_length', 'That password is too long. Choose a shorter one.'],
    ])('words the %s rule', async (rule, sentence) => {
      vi.mocked(fetch).mockResolvedValueOnce(linkFor('invite')).mockResolvedValueOnce(respond(422, {
        code: 'validation',
        detail: { faults: [{ field: 'password', rule, message: 'x' }] },
      }))
      const { wrapper } = await open()

      await choose(wrapper, 'password-under-test')

      expect(wrapper.find('[data-testid="password-error"]').text()).toBe(sentence)
    })
  })

  it('catches a mistyped confirmation before sending anything', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(linkFor('invite'))
    const { wrapper } = await open()

    await choose(wrapper, 'a-strong-new-password', 'a-strong-new-passwrod')

    expect(wrapper.find('[data-testid="password-error"]').text()).toBe("The passwords don't match.")
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  describe('opened while signed in', () => {
    it('sends someone signed in as a different user to their own authoring', async () => {
      useAuthStore().signIn('admin-session', { id: 'u-admin', email: 'admin@example.com' })
      vi.mocked(fetch).mockResolvedValueOnce(linkFor('invite'))
      const { router } = await open()

      expect(router.currentRoute.value.path).toBe('/authoring')
    })

    it('sends them away when it cannot tell whose session it is', async () => {
      useAuthStore().signIn('some-session')
      vi.mocked(fetch)
        .mockResolvedValueOnce(linkFor('invite'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      const { router } = await open()

      expect(router.currentRoute.value.path).toBe('/authoring')
    })

    it('lets the user the link is for choose a new password', async () => {
      useAuthStore().signIn('old-session', { id: 'u-new', email: 'New@Example.com' })
      vi.mocked(fetch).mockResolvedValueOnce(linkFor('reset'))
      const { router, wrapper } = await open()

      expect(router.currentRoute.value.name).toBe('welcome')
      expect(wrapper.find('form').exists()).toBe(true)
    })
  })
})
