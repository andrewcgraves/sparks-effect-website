import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import PhoneMapPage from './PhoneMapPage.vue'
import type { PhoneMapTab } from './phoneMapTabs'
import { seriousA11yViolations } from '../test/axe'

enableAutoUnmount(afterEach)

const TABS: PhoneMapTab[] = [
  { key: 'plot', label: 'Plot' },
  { key: 'results', label: 'Results', disabled: true },
  { key: 'stations', label: 'Stations' },
]

function mountPage(options: { tabs?: PhoneMapTab[]; tab?: string; pickArmed?: boolean; attach?: boolean; title?: string } = {}) {
  const tab = ref(options.tab ?? 'plot')
  const pickArmed = ref(options.pickArmed ?? false)
  const Host = defineComponent({
    setup() {
      return () =>
        h(
          PhoneMapPage,
          {
            title: options.title ?? 'CA HSR',
            tabs: options.tabs ?? TABS,
            tab: tab.value,
            'onUpdate:tab': (next: string) => (tab.value = next),
            pickArmed: pickArmed.value,
          },
          {
            map: () => h('div', { 'data-testid': 'the-map' }, 'map'),
            'panel-plot': () => h('p', 'plot form'),
            'panel-results': () => h('p', 'results'),
            'panel-stations': () => h('p', 'stations'),
          },
        )
    },
  })
  const wrapper = mount(Host, options.attach ? { attachTo: document.body } : {})
  return { wrapper, tab, pickArmed }
}

function tabs(wrapper: ReturnType<typeof mountPage>['wrapper']) {
  return wrapper.findAll('[role="tab"]')
}

function panels(wrapper: ReturnType<typeof mountPage>['wrapper']) {
  return wrapper.findAll('[role="tabpanel"]')
}

function isShown(panel: { element: Element }): boolean {
  return (panel.element as HTMLElement).style.display !== 'none'
}

describe('PhoneMapPage', () => {
  it('has no serious or critical accessibility violations', async () => {
    const { wrapper } = mountPage({ attach: true })
    expect(await seriousA11yViolations(wrapper)).toEqual([])
  })

  it('titles the page and shows the map', () => {
    const { wrapper } = mountPage()
    expect(wrapper.get('h1').text()).toBe('CA HSR')
    expect(wrapper.find('[data-testid="the-map"]').exists()).toBe(true)
  })

  it('holds the title line with a skeleton, not an empty heading, until the title is known', () => {
    const { wrapper } = mountPage({ title: '' })
    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.find('header [aria-busy="true"]').exists()).toBe(true)
  })

  it('shows the chosen tab alone, keeping the others in the tree', async () => {
    const { wrapper } = mountPage()
    expect(panels(wrapper).map(isShown)).toEqual([true, false, false])
    expect(tabs(wrapper).map((tab) => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false'])

    await tabs(wrapper)[2].trigger('click')

    expect(panels(wrapper).map(isShown)).toEqual([false, false, true])
    expect(tabs(wrapper)[2].attributes('aria-selected')).toBe('true')
  })

  it('names each panel after its tab and each tab controls its panel', () => {
    const { wrapper } = mountPage()
    const [tab] = tabs(wrapper)
    const [panel] = panels(wrapper)
    expect(tab.attributes('id')).toBeTruthy()
    expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'))
    expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'))
  })

  it('keeps a single tab stop in the list: the selected tab', async () => {
    const { wrapper } = mountPage()
    expect(tabs(wrapper).map((tab) => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1'])

    await tabs(wrapper)[2].trigger('click')

    expect(tabs(wrapper).map((tab) => tab.attributes('tabindex'))).toEqual(['-1', '-1', '0'])
  })

  it('does not select a disabled tab', async () => {
    const { wrapper, tab } = mountPage()
    expect(tabs(wrapper)[1].attributes('disabled')).toBeDefined()

    await tabs(wrapper)[1].trigger('click')

    expect(tab.value).toBe('plot')
  })

  it('moves the selection with the arrow keys, skipping a disabled tab and wrapping', async () => {
    const { wrapper, tab } = mountPage({ attach: true })
    const list = wrapper.get('[role="tablist"]')

    await list.trigger('keydown', { key: 'ArrowRight' })
    expect(tab.value).toBe('stations')
    expect(document.activeElement).toBe(tabs(wrapper)[2].element)

    await list.trigger('keydown', { key: 'ArrowRight' })
    expect(tab.value).toBe('plot')

    await list.trigger('keydown', { key: 'ArrowLeft' })
    expect(tab.value).toBe('stations')

    await list.trigger('keydown', { key: 'Home' })
    expect(tab.value).toBe('plot')

    await list.trigger('keydown', { key: 'End' })
    expect(tab.value).toBe('stations')
  })

  it('has a panel toggle button that says whether the panel is expanded', async () => {
    const { wrapper } = mountPage()
    const toggle = wrapper.get('[data-testid="phone-panel-toggle"]')
    const panel = wrapper.get('[data-testid="phone-panel"]')
    expect(toggle.element.tagName).toBe('BUTTON')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('aria-controls')).toBe(panel.attributes('id'))

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('gives the map room while a pick is armed and the panel back when it ends', async () => {
    const { wrapper, pickArmed } = mountPage()
    const toggle = () => wrapper.get('[data-testid="phone-panel-toggle"]')

    pickArmed.value = true
    await wrapper.vm.$nextTick()
    expect(toggle().attributes('aria-expanded')).toBe('false')

    pickArmed.value = false
    await wrapper.vm.$nextTick()
    expect(toggle().attributes('aria-expanded')).toBe('true')
  })

  it('expands a shrunk panel when a tab is chosen', async () => {
    const { wrapper } = mountPage()
    await wrapper.get('[data-testid="phone-panel-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="phone-panel-toggle"]').attributes('aria-expanded')).toBe('false')

    await tabs(wrapper)[2].trigger('click')

    expect(wrapper.get('[data-testid="phone-panel-toggle"]').attributes('aria-expanded')).toBe('true')
  })
})
