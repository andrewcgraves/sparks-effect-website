import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import StopActionsMenu from './StopActionsMenu.vue'

const mounted: VueWrapper[] = []

function mountMenu(props: Partial<{ first: boolean; last: boolean; editingPosition: boolean }> = {}) {
  const wrapper = mount(StopActionsMenu, {
    props: { label: 'Fresno', index: 3, first: false, last: false, editingPosition: false, ...props },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

function itemTexts(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[role="menuitem"]').map((item) => item.text())
}

describe('StopActionsMenu', () => {
  afterEach(() => {
    while (mounted.length) mounted.pop()!.unmount()
  })

  it('names the stop on its button and on every item', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.get('[data-testid="stop-actions-3"]')
    expect(trigger.attributes('aria-label')).toBe('Actions for Fresno')
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('click')

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(trigger.attributes('aria-controls')).toBe(wrapper.get('[role="menu"]').attributes('id'))
    expect(itemTexts(wrapper)).toEqual([
      'Move Fresno up',
      'Move Fresno down',
      'Edit position of Fresno',
      'Show Fresno on map',
      'Remove Fresno',
    ])
  })

  it('offers to hide the position while it is being edited', async () => {
    const wrapper = mountMenu({ editingPosition: true })
    await wrapper.get('[data-testid="stop-actions-3"]').trigger('click')

    expect(wrapper.get('[data-testid="stop-edit-position-3"]').text()).toBe('Hide position of Fresno')
  })

  it('opens on the last item from ArrowUp, and walks with Home and End', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.get('[data-testid="stop-actions-3"]')

    await trigger.trigger('keydown', { key: 'ArrowUp' })
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-remove-3"]').element)

    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-up-3"]').element)
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-remove-3"]').element)
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(wrapper.get('[data-testid="stop-up-3"]').element)
  })

  it('reports the item chosen, closes, and hands focus back to its button', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.get('[data-testid="stop-actions-3"]')
    await trigger.trigger('click')

    await wrapper.get('[data-testid="stop-show-3"]').trigger('click')

    expect(wrapper.emitted()).toHaveProperty('show-on-map')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('closes without taking focus when tabbed out of', async () => {
    const wrapper = mountMenu()
    await wrapper.get('[data-testid="stop-actions-3"]').trigger('click')

    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Tab' })

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('closes on a press anywhere outside it', async () => {
    const wrapper = mountMenu()
    await wrapper.get('[data-testid="stop-actions-3"]').trigger('click')

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('stays open for a press inside it', async () => {
    const wrapper = mountMenu()
    await wrapper.get('[data-testid="stop-actions-3"]').trigger('click')

    wrapper.get('[role="menu"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
  })

  it('emits nothing for a move it cannot make', async () => {
    const wrapper = mountMenu({ first: true })
    await wrapper.get('[data-testid="stop-actions-3"]').trigger('click')

    await wrapper.get('[data-testid="stop-up-3"]').trigger('click')

    expect(wrapper.emitted('move-up')).toBeUndefined()
  })
})
