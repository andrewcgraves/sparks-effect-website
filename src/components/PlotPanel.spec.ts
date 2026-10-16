import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlotPanel from './PlotPanel.vue'

function mountPanel(props: { hasSaved: boolean | null; offline: boolean }) {
  return mount(PlotPanel, {
    props,
    slots: {
      plot: '<form data-testid="form" />',
      saved: '<ul data-testid="list" />',
    },
  })
}

const visible = (wrapper: ReturnType<typeof mountPanel>, testid: string) =>
  // v-show hides with an inline display: none somewhere up the tree.
  !wrapper.get(`[data-testid="${testid}"]`).element.closest('[style*="display: none"]')

describe('PlotPanel', () => {
  it('offers no switch until there are saved splash zones, showing only the form', () => {
    for (const hasSaved of [null, false]) {
      const wrapper = mountPanel({ hasSaved, offline: false })
      expect(wrapper.find('[data-testid="plot-source"]').exists()).toBe(false)
      expect(visible(wrapper, 'form')).toBe(true)
      expect(visible(wrapper, 'list')).toBe(false)
    }
  })

  // The list has to be mounted to load; the panel learns it has entries from it.
  it('mounts the saved list even before it knows there is anything in it', () => {
    const wrapper = mountPanel({ hasSaved: null, offline: false })
    expect(wrapper.find('[data-testid="list"]').exists()).toBe(true)
  })

  it('puts Plot your own first, and opens on it', () => {
    const wrapper = mountPanel({ hasSaved: true, offline: false })

    const labels = wrapper.findAll('[data-testid="plot-source"] label').map((l) => l.text())
    expect(labels).toEqual(['Plot your own', 'Saved splash zones'])
    expect(visible(wrapper, 'form')).toBe(true)
    expect(visible(wrapper, 'list')).toBe(false)
  })

  it('turns to the saved splash zones when routing goes offline, and stays there when it returns', async () => {
    const wrapper = mountPanel({ hasSaved: true, offline: false })

    await wrapper.setProps({ offline: true })
    expect(visible(wrapper, 'list')).toBe(true)

    await wrapper.setProps({ offline: false })
    expect(visible(wrapper, 'list')).toBe(true)
  })

  it('turns to them too when the list arrives after routing has gone offline', async () => {
    const wrapper = mountPanel({ hasSaved: null, offline: true })

    await wrapper.setProps({ hasSaved: true })

    expect(visible(wrapper, 'list')).toBe(true)
  })

  // An outage is the same caution the routing banner gives, not an error.
  it('explains, in place of the form, that plotting is unavailable while offline', async () => {
    const wrapper = mountPanel({ hasSaved: true, offline: true })

    await wrapper.get('[data-testid="plot-source-option-plot"]').setValue(true)

    const notice = wrapper.get('[data-testid="plot-unavailable"]')
    expect(notice.attributes('role')).toBe('status')
    expect(notice.classes()).toContain('border-apricot')
    expect(notice.classes()).not.toContain('border-error')
    expect(visible(wrapper, 'plot-unavailable')).toBe(true)
    expect(visible(wrapper, 'form')).toBe(false)
  })

  // With nothing saved to offer, the form stays, disabled, beside the banner
  // that explains why: an explanation alone would leave the panel empty.
  it('keeps the form for a network with nothing saved, even offline', () => {
    const wrapper = mountPanel({ hasSaved: false, offline: true })

    expect(wrapper.find('[data-testid="plot-unavailable"]').exists()).toBe(false)
    expect(visible(wrapper, 'form')).toBe(true)
  })
})
