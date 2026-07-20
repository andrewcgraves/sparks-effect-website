import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { getActivePinia } from 'pinia'
import { installStores, useAuthStore } from './index'
import { apiRequest, setAuthTokenProvider } from '../api/authoring'

const Noop = defineComponent({ render: () => h('div') })

describe('installStores', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    setAuthTokenProvider(null)
    vi.restoreAllMocks()
  })

  it('makes stores usable inside the app', () => {
    const app = createApp(Noop)
    installStores(app)
    app.mount(document.createElement('div'))
    expect(getActivePinia()).toBeDefined()
    expect(useAuthStore().isAuthenticated).toBe(false)
    app.unmount()
  })

  it('feeds the auth store token into API requests', async () => {
    const app = createApp(Noop)
    installStores(app)
    app.mount(document.createElement('div'))

    useAuthStore().signIn('tok-1', { id: 'u1' })

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    await apiRequest('/api/services')

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok-1')
    app.unmount()
  })

  it('stops sending the token after sign-out', async () => {
    const app = createApp(Noop)
    installStores(app)
    app.mount(document.createElement('div'))

    const auth = useAuthStore()
    auth.signIn('tok-1', { id: 'u1' })
    auth.signOut()

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    await apiRequest('/api/services')

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
    app.unmount()
  })
})
