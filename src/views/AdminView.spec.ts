import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('../components/AdminPeople.vue', () => ({ default: { template: '<div data-testid="people-panel" />' } }))
vi.mock('../components/AdminPublished.vue', () => ({ default: { template: '<div data-testid="published-panel" />' } }))

import AdminView from './AdminView.vue'
import { seriousA11yViolations } from '../test/axe'

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin', component: AdminView }] })
}

async function mountAt(path: string) {
  const router = makeRouter()
  await router.push(path)
  const wrapper = mount(AdminView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

describe('AdminView', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('opens on the People tab', async () => {
    const { wrapper } = await mountAt('/admin')

    expect(wrapper.get('h1').text()).toBe('Admin')
    expect(wrapper.get('[data-testid="tab-people"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('[data-testid="people-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="published-panel"]').exists()).toBe(false)
  })

  it('switches to the Published tab, and remembers it in the URL', async () => {
    const { wrapper, router } = await mountAt('/admin')

    await wrapper.get('[data-testid="tab-published"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="tab-published"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('[data-testid="published-panel"]').exists()).toBe(true)
    expect(router.currentRoute.value.query.tab).toBe('published')
  })

  it('opens the tab the URL names', async () => {
    const { wrapper } = await mountAt('/admin?tab=published')

    expect(wrapper.find('[data-testid="published-panel"]').exists()).toBe(true)
  })

  it('ties each tab to its panel', async () => {
    const { wrapper } = await mountAt('/admin')

    const tab = wrapper.get('[data-testid="tab-people"]')
    const panel = wrapper.get('[role="tabpanel"]')
    expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'))
    expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'))
  })

  it('moves between tabs with the arrow keys', async () => {
    const { wrapper } = await mountAt('/admin')

    await wrapper.get('[data-testid="tab-people"]').trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()

    expect(wrapper.find('[data-testid="published-panel"]').exists()).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('[data-testid="tab-published"]').element)
  })

  it('has no serious or critical accessibility violations', async () => {
    const { wrapper } = await mountAt('/admin')
    expect(await seriousA11yViolations(wrapper)).toEqual([])
  })
})
