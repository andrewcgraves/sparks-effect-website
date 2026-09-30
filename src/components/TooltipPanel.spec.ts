import { describe, expect, it, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import TooltipPanel from './TooltipPanel.vue'
import { TOOLTIP_GAP_PX, TOOLTIP_PANEL_CLASS, TOOLTIP_WIDTH_PX } from './tooltip'

const viewport = { width: 800, height: 600 }

function stubRect(el: Element, rect: { top: number; right: number; bottom: number; left: number }): void {
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect
}

function stubViewport(): void {
  Object.defineProperty(window, 'innerWidth', { value: viewport.width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: viewport.height, configurable: true })
}

describe('TooltipPanel', () => {
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  describe('opened from a trigger', () => {
    function mountWithTrigger(content = '<p>More about this</p>') {
      stubViewport()
      wrapper = mount(TooltipPanel, {
        slots: {
          trigger: '<button type="button">Hint</button>',
          default: content,
        },
        attachTo: document.body,
      })
      stubRect(wrapper.get('button').element, { top: 100, right: 180, bottom: 128, left: 40 })
      return wrapper
    }

    it('shows nothing until the trigger is hovered or focused', () => {
      const mounted = mountWithTrigger()
      expect(mounted.find('[data-testid="tooltip"]').exists()).toBe(false)
    })

    it('opens on hover, with the slotted content', async () => {
      const mounted = mountWithTrigger()

      await mounted.get('[data-testid="tooltip-trigger"]').trigger('mouseenter')

      expect(mounted.get('[data-testid="tooltip"]').text()).toBe('More about this')
    })

    it('opens on focus too, so the content is reachable from the keyboard', async () => {
      const mounted = mountWithTrigger()

      await mounted.get('[data-testid="tooltip-trigger"]').trigger('focusin')

      expect(mounted.find('[data-testid="tooltip"]').exists()).toBe(true)
    })

    it('closes when the pointer leaves and when focus leaves', async () => {
      const mounted = mountWithTrigger()
      const trigger = mounted.get('[data-testid="tooltip-trigger"]')

      await trigger.trigger('mouseenter')
      expect(mounted.find('[data-testid="tooltip"]').exists()).toBe(true)
      await trigger.trigger('mouseleave')
      expect(mounted.find('[data-testid="tooltip"]').exists()).toBe(false)

      await trigger.trigger('focusin')
      expect(mounted.find('[data-testid="tooltip"]').exists()).toBe(true)
      await trigger.trigger('focusout')
      expect(mounted.find('[data-testid="tooltip"]').exists()).toBe(false)
    })

    it('renders structured slot content, not only a string', async () => {
      const mounted = mountWithTrigger(
        '<dl><dt>Arrived with</dt><dd>1h 30m left</dd></dl>',
      )

      await mounted.get('[data-testid="tooltip-trigger"]').trigger('mouseenter')

      expect(mounted.get('dt').text()).toBe('Arrived with')
      expect(mounted.get('dd').text()).toBe('1h 30m left')
    })

    it('wears the panel recipe and announces itself as a tooltip', async () => {
      const mounted = mountWithTrigger()

      await mounted.get('[data-testid="tooltip-trigger"]').trigger('mouseenter')

      const panel = mounted.get('[data-testid="tooltip"]')
      expect(panel.attributes('role')).toBe('tooltip')
      expect(panel.classes().join(' ')).toContain(TOOLTIP_PANEL_CLASS.split(' ')[0])
      expect(panel.classes()).toContain('fixed')
    })

    it('places the box below the trigger when there is room', async () => {
      const mounted = mountWithTrigger()

      await mounted.get('[data-testid="tooltip-trigger"]').trigger('mouseenter')
      await nextTick()

      expect(mounted.get('[data-testid="tooltip"]').attributes('style')).toContain(
        `top: ${128 + TOOLTIP_GAP_PX}px`,
      )
      expect(mounted.get('[data-testid="tooltip"]').attributes('style')).toContain(
        `left: 40px`,
      )
      expect(mounted.get('[data-testid="tooltip"]').attributes('style')).toContain(
        `width: ${TOOLTIP_WIDTH_PX}px`,
      )
    })

    it('flips above the trigger when the trigger sits at the foot of the window', async () => {
      const mounted = mountWithTrigger()
      stubRect(mounted.get('button').element, { top: 500, right: 180, bottom: 528, left: 40 })

      await mounted.get('[data-testid="tooltip-trigger"]').trigger('mouseenter')
      await nextTick()

      expect(mounted.get('[data-testid="tooltip"]').attributes('style')).toContain(
        `bottom: ${viewport.height - 500 + TOOLTIP_GAP_PX}px`,
      )
      expect(mounted.get('[data-testid="tooltip"]').attributes('style')).not.toContain('top:')
    })

    it('keeps the box on-screen when the trigger sits against the right edge', async () => {
      const mounted = mountWithTrigger()
      stubRect(mounted.get('button').element, { top: 100, right: 796, bottom: 128, left: 700 })

      await mounted.get('[data-testid="tooltip-trigger"]').trigger('mouseenter')
      await nextTick()

      expect(mounted.get('[data-testid="tooltip"]').attributes('style')).toContain(
        `left: ${viewport.width - TOOLTIP_WIDTH_PX - TOOLTIP_GAP_PX}px`,
      )
    })
  })

  describe('opened by the caller', () => {
    it('shows the box when open is set, without a trigger', async () => {
      stubViewport()
      const anchor = document.createElement('div')
      document.body.append(anchor)
      stubRect(anchor, { top: 80, right: 200, bottom: 110, left: 24 })

      wrapper = mount(TooltipPanel, {
        props: { open: true, anchor },
        slots: { default: '<p>Beside the row</p>' },
        attachTo: document.body,
      })
      await nextTick()

      expect(wrapper.get('[data-testid="tooltip"]').text()).toBe('Beside the row')
      expect(wrapper.get('[data-testid="tooltip"]').attributes('style')).toContain(
        `top: ${110 + TOOLTIP_GAP_PX}px`,
      )
      anchor.remove()
    })

    it('hides the box when open is false, even if an anchor is present', () => {
      const anchor = document.createElement('div')
      wrapper = mount(TooltipPanel, {
        props: { open: false, anchor },
        slots: { default: '<p>Hidden</p>' },
      })

      expect(wrapper.find('[data-testid="tooltip"]').exists()).toBe(false)
    })

    it('repositions when the window resizes while open', async () => {
      stubViewport()
      const anchor = document.createElement('div')
      document.body.append(anchor)
      stubRect(anchor, { top: 80, right: 200, bottom: 110, left: 24 })

      wrapper = mount(TooltipPanel, {
        props: { open: true, anchor },
        slots: { default: '<p>Anchored</p>' },
        attachTo: document.body,
      })
      await nextTick()

      stubRect(anchor, { top: 80, right: 790, bottom: 110, left: 700 })
      window.dispatchEvent(new Event('resize'))
      await nextTick()

      expect(wrapper.get('[data-testid="tooltip"]').attributes('style')).toContain(
        `left: ${viewport.width - TOOLTIP_WIDTH_PX - TOOLTIP_GAP_PX}px`,
      )
      anchor.remove()
    })
  })
})
