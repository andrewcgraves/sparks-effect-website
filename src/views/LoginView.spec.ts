import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import LoginView from './LoginView.vue'

const AuthoringStub = { template: '<div>authoring</div>' }
const OtherStub = { template: '<div>other</div>' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/authoring', name: 'authoring', component: AuthoringStub },
      { path: '/scenario/:slug', name: 'scenario', component: OtherStub },
    ],
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders email and password fields', async () => {
    const router = makeRouter()
    await router.push('/login')
    const wrapper = mount(LoginView, { global: { plugins: [router] } })
    expect(wrapper.find('input[data-testid="email"]').exists()).toBe(true)
    expect(wrapper.find('input[data-testid="password"]').exists()).toBe(true)
  })

  it('disables submit until both fields are filled', async () => {
    const router = makeRouter()
    await router.push('/login')
    const wrapper = mount(LoginView, { global: { plugins: [router] } })
    expect((wrapper.find('[data-testid="submit"]').element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('input[data-testid="email"]').setValue('a@example.com')
    await wrapper.find('input[data-testid="password"]').setValue('secret')
    expect((wrapper.find('[data-testid="submit"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('logs in and redirects to /authoring by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ token: 'tok-1', expires_at: '2026-07-21T00:00:00Z', user: { id: 'u1', email: 'a@example.com' } }),
    } as Response)

    const router = makeRouter()
    await router.push('/login')
    const wrapper = mount(LoginView, { global: { plugins: [router] } })

    await wrapper.find('input[data-testid="email"]').setValue('a@example.com')
    await wrapper.find('input[data-testid="password"]').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/authoring')
  })

  it('redirects to the ?redirect= destination on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ token: 'tok-1', expires_at: '2026-07-21T00:00:00Z', user: { id: 'u1', email: 'a@example.com' } }),
    } as Response)

    const router = makeRouter()
    await router.push('/login?redirect=/scenario/ca-hsr')
    const wrapper = mount(LoginView, { global: { plugins: [router] } })

    await wrapper.find('input[data-testid="email"]').setValue('a@example.com')
    await wrapper.find('input[data-testid="password"]').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/scenario/ca-hsr')
  })

  it('shows a generic invalid-credentials message on a 401 and stays on the page', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid email or password' }),
    } as Response)

    const router = makeRouter()
    await router.push('/login')
    const wrapper = mount(LoginView, { global: { plugins: [router] } })

    await wrapper.find('input[data-testid="email"]').setValue('a@example.com')
    await wrapper.find('input[data-testid="password"]').setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="login-error"]').text()).toBe('Invalid email or password.')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('shows a generic error message on a server failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const router = makeRouter()
    await router.push('/login')
    const wrapper = mount(LoginView, { global: { plugins: [router] } })

    await wrapper.find('input[data-testid="email"]').setValue('a@example.com')
    await wrapper.find('input[data-testid="password"]').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="login-error"]').text()).toBe('Something went wrong signing in. Try again.')
  })
})
