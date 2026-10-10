import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import SiteHeader from './SiteHeader.vue'
import { useAuthStore } from '../stores/auth'
import { seriousA11yViolations } from '../test/axe'

const Blank = { template: '<div />' }

async function mountHeader(routes: RouteRecordRaw[] = [], at = '/', attachTo?: HTMLElement) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Blank },
      { path: '/login', component: Blank },
      { path: '/authoring', component: Blank },
      { path: '/admin', component: Blank },
      ...routes,
    ],
  })
  await router.push(at)
  await router.isReady()
  const wrapper = mount(SiteHeader, { global: { plugins: [router] }, attachTo })
  await flushPromises()
  return wrapper
}

function primaryLinks(wrapper: Awaited<ReturnType<typeof mountHeader>>) {
  return wrapper.findAll('nav[aria-label="Primary"] a')
}

function accountMenuItems(wrapper: Awaited<ReturnType<typeof mountHeader>>) {
  return wrapper
    .findAll('[role="menu"] [role="menuitem"]')
    .map((item) => [item.text(), item.attributes('href')])
}

describe('SiteHeader', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  it('links the text-only wordmark home', async () => {
    const wordmark = (await mountHeader()).get('[data-testid="nav-home"]')
    expect(wordmark.attributes('href')).toBe('/')
    expect(wordmark.text()).toBe('Sparks Effect')
    expect(wordmark.find('svg, img').exists()).toBe(false)
  })

  it('links no primary pages that do not exist yet', async () => {
    expect(primaryLinks(await mountHeader())).toHaveLength(0)
  })

  it('links each primary page once its route exists, in a fixed order', async () => {
    const wrapper = await mountHeader([
      { path: '/how-it-works', component: Blank },
      { path: '/lines', component: Blank },
      { path: '/networks', component: Blank },
    ])
    expect(primaryLinks(wrapper).map((link) => [link.text(), link.attributes('href')])).toEqual([
      ['Networks', '/networks'],
      ['Lines', '/lines'],
      ['How it works', '/how-it-works'],
    ])
  })

  it('links only the primary pages whose routes exist', async () => {
    const wrapper = await mountHeader([{ path: '/lines', component: Blank }])
    expect(primaryLinks(wrapper).map((link) => link.text())).toEqual(['Lines'])
  })

  it('marks the primary link for the current page, and only that one', async () => {
    const wrapper = await mountHeader(
      [
        { path: '/networks', component: Blank },
        { path: '/lines', component: Blank },
      ],
      '/lines',
    )
    const [networks, lines] = primaryLinks(wrapper)
    expect(lines.attributes('aria-current')).toBe('page')
    expect(networks.attributes('aria-current')).toBeUndefined()
  })

  it('marks a primary link on any page beneath its path', async () => {
    const wrapper = await mountHeader(
      [
        { path: '/lines', component: Blank },
        { path: '/lines/:slug', component: Blank },
        { path: '/linesmen', component: Blank },
      ],
      '/lines/caltrain',
    )
    const [lines] = primaryLinks(wrapper)
    expect(lines.attributes('aria-current')).toBe('page')
  })

  it('does not mark a primary link for a page that only shares its prefix', async () => {
    const wrapper = await mountHeader(
      [
        { path: '/lines', component: Blank },
        { path: '/linesmen', component: Blank },
      ],
      '/linesmen',
    )
    const [lines] = primaryLinks(wrapper)
    expect(lines.attributes('aria-current')).toBeUndefined()
  })

  it('shows a sign-in link when signed out', async () => {
    const wrapper = await mountHeader()
    expect(wrapper.find('[data-testid="nav-login"]').attributes('href')).toBe('/login')
  })

  it('shows a menu button named for the user when signed in, in place of sign-in', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', name: 'Ada Lovelace' })
    const wrapper = await mountHeader()
    const trigger = wrapper.get('[data-testid="account-menu-button"]')
    expect(trigger.text()).toBe('Ada Lovelace')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(false)
  })

  it('names the menu button for the email until a display name is set', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    const wrapper = await mountHeader()
    expect(wrapper.get('[data-testid="account-menu-button"]').text()).toBe('a@example.com')
  })

  it('opens a menu of My authoring, Account and Sign out for a member', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: false })
    const wrapper = await mountHeader([{ path: '/account', component: Blank }], '/', document.body)
    await wrapper.get('[data-testid="account-menu-button"]').trigger('click')

    expect(accountMenuItems(wrapper)).toEqual([
      ['My authoring', '/authoring'],
      ['Account', '/account'],
      ['Sign out', undefined],
    ])
    wrapper.unmount()
  })

  it('adds Admin to the menu for an admin, before the separator and Sign out', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: true })
    const wrapper = await mountHeader([{ path: '/account', component: Blank }], '/', document.body)
    await wrapper.get('[data-testid="account-menu-button"]').trigger('click')

    expect(accountMenuItems(wrapper)).toEqual([
      ['My authoring', '/authoring'],
      ['Account', '/account'],
      ['Admin', '/admin'],
      ['Sign out', undefined],
    ])
    const menu = wrapper.get('[role="menu"]')
    expect(menu.find('[role="separator"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('signs out from the menu, revoking the session, and lands on the home page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    const auth = useAuthStore()
    auth.signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    const wrapper = await mountHeader([{ path: '/account', component: Blank }], '/authoring', document.body)
    await wrapper.get('[data-testid="account-menu-button"]').trigger('click')

    await wrapper.get('[data-testid="nav-sign-out"]').trigger('click')
    await flushPromises()

    expect(auth.isAuthenticated).toBe(false)
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/auth/logout')
    expect(wrapper.vm.$route.path).toBe('/')
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(true)
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('leaves a signed-in page for home without waiting on the revoke', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    const wrapper = await mountHeader([{ path: '/account', component: Blank }], '/authoring', document.body)
    await wrapper.get('[data-testid="account-menu-button"]').trigger('click')

    await wrapper.get('[data-testid="nav-sign-out"]').trigger('click')
    await flushPromises()

    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(wrapper.vm.$route.path).toBe('/')
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('closes the account menu when the page changes under it', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    const wrapper = await mountHeader([{ path: '/account', component: Blank }], '/', document.body)
    await wrapper.get('[data-testid="account-menu-button"]').trigger('click')

    await wrapper.vm.$router.push('/account')
    await flushPromises()

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })

  describe('account menu from the keyboard', () => {
    async function mountSignedIn() {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: true })
      const wrapper = await mountHeader([{ path: '/account', component: Blank }], '/', document.body)
      return { wrapper, trigger: wrapper.get('[data-testid="account-menu-button"]') }
    }

    function focusedText() {
      return document.activeElement?.textContent?.trim()
    }

    it('opens on its first item, walks with the arrows, Home and End, and wraps', async () => {
      const { wrapper, trigger } = await mountSignedIn()
      // A button activated by Enter fires click; that is the path under test.
      await trigger.trigger('click')
      await flushPromises()
      expect(focusedText()).toBe('My authoring')

      const menu = wrapper.get('[role="menu"]')
      await menu.trigger('keydown', { key: 'ArrowDown' })
      expect(focusedText()).toBe('Account')
      await menu.trigger('keydown', { key: 'End' })
      expect(focusedText()).toBe('Sign out')
      await menu.trigger('keydown', { key: 'ArrowDown' })
      expect(focusedText()).toBe('My authoring')
      await menu.trigger('keydown', { key: 'ArrowUp' })
      expect(focusedText()).toBe('Sign out')
      await menu.trigger('keydown', { key: 'Home' })
      expect(focusedText()).toBe('My authoring')
      wrapper.unmount()
    })

    it('opens on the last item from ArrowUp on the button', async () => {
      const { wrapper, trigger } = await mountSignedIn()
      await trigger.trigger('keydown', { key: 'ArrowUp' })
      await flushPromises()
      expect(focusedText()).toBe('Sign out')
      wrapper.unmount()
    })

    it('closes on Escape and hands focus back to the button', async () => {
      const { wrapper, trigger } = await mountSignedIn()
      await trigger.trigger('click')
      await flushPromises()

      await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })

      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger.element)
      wrapper.unmount()
    })

    it('closes on a click outside it', async () => {
      const { wrapper, trigger } = await mountSignedIn()
      await trigger.trigger('click')
      await flushPromises()

      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await flushPromises()

      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('closes once an item is followed', async () => {
      const { wrapper, trigger } = await mountSignedIn()
      await trigger.trigger('click')
      await wrapper.get('[data-testid="nav-account"]').trigger('click')
      await flushPromises()

      expect(wrapper.vm.$route.path).toBe('/account')
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('phone-width menu', () => {
    const PRIMARY_ROUTES: RouteRecordRaw[] = [
      { path: '/networks', component: Blank },
      { path: '/lines', component: Blank },
      { path: '/account', component: Blank },
    ]

    function sheetLinks(wrapper: Awaited<ReturnType<typeof mountHeader>>) {
      return wrapper
        .get('[data-testid="site-menu-sheet"]')
        .findAll('a, button')
        .map((item) => [item.text(), item.attributes('href')])
    }

    it('is one closed Menu button that controls the sheet', async () => {
      const wrapper = await mountHeader(PRIMARY_ROUTES)
      const button = wrapper.get('[data-testid="site-menu-button"]')
      expect(button.text()).toBe('Menu')
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(wrapper.find('[data-testid="site-menu-sheet"]').exists()).toBe(false)

      await button.trigger('click')

      expect(button.attributes('aria-expanded')).toBe('true')
      expect(button.attributes('aria-controls')).toBe(
        wrapper.get('[data-testid="site-menu-sheet"]').attributes('id'),
      )
    })

    it('holds the primary links and Sign in while signed out', async () => {
      const wrapper = await mountHeader(PRIMARY_ROUTES)
      await wrapper.get('[data-testid="site-menu-button"]').trigger('click')
      expect(sheetLinks(wrapper)).toEqual([
        ['Networks', '/networks'],
        ['Lines', '/lines'],
        ['Sign in', '/login'],
      ])
    })

    it('holds the primary links and the account items while signed in', async () => {
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', name: 'Ada', is_admin: true })
      const wrapper = await mountHeader(PRIMARY_ROUTES)
      await wrapper.get('[data-testid="site-menu-button"]').trigger('click')

      expect(sheetLinks(wrapper)).toEqual([
        ['Networks', '/networks'],
        ['Lines', '/lines'],
        ['My authoring', '/authoring'],
        ['Account', '/account'],
        ['Admin', '/admin'],
        ['Sign out', undefined],
      ])
      expect(wrapper.get('[data-testid="site-menu-sheet"]').text()).toContain('Ada')
    })

    it('signs out from the sheet and lands on the home page', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
      useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
      const wrapper = await mountHeader(PRIMARY_ROUTES, '/authoring')
      await wrapper.get('[data-testid="site-menu-button"]').trigger('click')

      await wrapper.get('[data-testid="site-menu-sign-out"]').trigger('click')
      await flushPromises()

      expect(useAuthStore().isAuthenticated).toBe(false)
      expect(wrapper.vm.$route.path).toBe('/')
      expect(wrapper.find('[data-testid="site-menu-sheet"]').exists()).toBe(false)
      vi.unstubAllGlobals()
    })

    it('closes on Escape and hands focus back to the Menu button', async () => {
      const wrapper = await mountHeader(PRIMARY_ROUTES, '/', document.body)
      const button = wrapper.get('[data-testid="site-menu-button"]')
      await button.trigger('click')

      await wrapper.get('[data-testid="site-menu-sheet"]').trigger('keydown', { key: 'Escape' })

      expect(wrapper.find('[data-testid="site-menu-sheet"]').exists()).toBe(false)
      expect(document.activeElement).toBe(button.element)
      wrapper.unmount()
    })

    it('closes when focus is tabbed out of the header', async () => {
      const outside = document.createElement('button')
      document.body.append(outside)
      const wrapper = await mountHeader(PRIMARY_ROUTES, '/', document.body)
      await wrapper.get('[data-testid="site-menu-button"]').trigger('click')
      const lastLink = wrapper.get<HTMLElement>('[data-testid="site-menu-sheet"] a:last-of-type')
      lastLink.element.focus()

      outside.focus()
      await flushPromises()

      expect(wrapper.find('[data-testid="site-menu-sheet"]').exists()).toBe(false)
      wrapper.unmount()
      outside.remove()
    })

    it('closes once a link is followed', async () => {
      const wrapper = await mountHeader(PRIMARY_ROUTES, '/', document.body)
      await wrapper.get('[data-testid="site-menu-button"]').trigger('click')

      await wrapper.get('[data-testid="site-menu-sheet"] a[href="/lines"]').trigger('click')
      await flushPromises()

      expect(wrapper.vm.$route.path).toBe('/lines')
      expect(wrapper.find('[data-testid="site-menu-sheet"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('closes on a click outside the header', async () => {
      const wrapper = await mountHeader(PRIMARY_ROUTES, '/', document.body)
      await wrapper.get('[data-testid="site-menu-button"]').trigger('click')

      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await flushPromises()

      expect(wrapper.find('[data-testid="site-menu-sheet"]').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  it('shows no account menu while signed out', async () => {
    const wrapper = await mountHeader()
    expect(wrapper.find('[data-testid="account-menu-button"]').exists()).toBe(false)
  })

  it('has no serious or critical accessibility violations with every link showing', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: true })
    const wrapper = await mountHeader(
      [
        { path: '/networks', component: Blank },
        { path: '/lines', component: Blank },
        { path: '/how-it-works', component: Blank },
      ],
      '/lines',
      document.body,
    )
    expect(await seriousA11yViolations(wrapper)).toEqual([])

    await wrapper.get('[data-testid="account-menu-button"]').trigger('click')
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    await wrapper.get('[data-testid="site-menu-button"]').trigger('click')
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })
})
