import { beforeEach, describe, expect, it } from 'vitest'
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
    expect(wrapper.find('[data-testid="nav-authoring"]').exists()).toBe(false)
  })

  it('shows a My authoring link when signed in', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    const wrapper = await mountHeader()
    expect(wrapper.find('[data-testid="nav-authoring"]').attributes('href')).toBe('/authoring')
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(false)
  })

  it('shows an Admin link to an admin', async () => {
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: true })
    const wrapper = await mountHeader()
    expect(wrapper.get('[data-testid="nav-admin"]').attributes('href')).toBe('/admin')
  })

  it('shows no Admin link to a signed-in non-admin, or while signed out', async () => {
    const signedOut = await mountHeader()
    expect(signedOut.find('[data-testid="nav-admin"]').exists()).toBe(false)

    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com', is_admin: false })
    const member = await mountHeader()
    expect(member.find('[data-testid="nav-admin"]').exists()).toBe(false)
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
    wrapper.unmount()
  })
})
