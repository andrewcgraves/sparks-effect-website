import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ToastRegion from './ToastRegion.vue'
import { TOAST_DURATION_MS, useAnnouncer, useToast, useToastHost } from '../composables/useToast'

describe('ToastRegion', () => {
  let host: VueWrapper

  beforeEach(() => {
    vi.useFakeTimers()
    host = mount(ToastRegion, { attachTo: document.body })
  })

  afterEach(() => {
    useToastHost().clear()
    host.unmount()
    vi.useRealTimers()
  })

  function region() {
    return host.get('[data-testid="toast-region"]')
  }

  function stack() {
    return host.get('[data-testid="toast-stack"]')
  }

  function messages(): string[] {
    return host.findAll('[data-testid="toast-message"]').map((m) => m.text())
  }

  async function show(message: string, kind?: 'success' | 'error'): Promise<void> {
    useToast().show(message, kind ? { kind } : undefined)
    await nextTick()
  }

  async function elapse(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms)
    await nextTick()
  }

  it('is a polite live region that is there before anything is said', () => {
    expect(region().attributes('aria-live')).toBe('polite')
    expect(region().attributes('role')).toBe('status')
    expect(messages()).toEqual([])
  })

  it('announces only the message, not the dismiss control', async () => {
    await show('Published')
    expect(region().text()).toBe('Published')
  })

  it('marks the kind of toast', async () => {
    await show('Not saved', 'error')
    expect(host.get('[data-testid="toast"]').attributes('data-kind')).toBe('error')
  })

  it('reads as success when no kind is given', async () => {
    await show('Saved')
    expect(host.get('[data-testid="toast"]').attributes('data-kind')).toBe('success')
  })

  it('dismisses itself after a few seconds', async () => {
    await show('Published')
    await elapse(TOAST_DURATION_MS - 1)
    expect(messages()).toEqual(['Published'])
    await elapse(1)
    expect(messages()).toEqual([])
  })

  it('can be dismissed by hand', async () => {
    await show('Published')
    await host.get('[data-testid="toast-dismiss"]').trigger('click')
    expect(messages()).toEqual([])
  })

  it('keeps at most three, dropping the oldest', async () => {
    await show('One')
    await show('Two')
    await show('Three')
    await show('Four')
    expect(messages()).toEqual(['Two', 'Three', 'Four'])
  })

  it('waits while hovered, then finishes counting down', async () => {
    await show('Published')
    await elapse(TOAST_DURATION_MS - 1000)
    await stack().trigger('mouseenter')
    await elapse(TOAST_DURATION_MS * 2)
    expect(messages()).toEqual(['Published'])
    await stack().trigger('mouseleave')
    await elapse(999)
    expect(messages()).toEqual(['Published'])
    await elapse(1)
    expect(messages()).toEqual([])
  })

  it('waits while focus is inside it', async () => {
    await show('Published')
    await stack().trigger('focusin')
    await elapse(TOAST_DURATION_MS * 2)
    expect(messages()).toEqual(['Published'])
    await stack().trigger('focusout')
    await elapse(TOAST_DURATION_MS)
    expect(messages()).toEqual([])
  })

  it('starts the clocks again when the toast holding focus is pushed out', async () => {
    await show('One')
    const dismiss = host.get('[data-testid="toast-dismiss"]').element as HTMLButtonElement
    dismiss.focus()
    await stack().trigger('focusin')
    await show('Two')
    await show('Three')
    await show('Four')
    expect(messages()).toEqual(['Two', 'Three', 'Four'])
    await elapse(TOAST_DURATION_MS)
    expect(messages()).toEqual([])
  })

  it('stays paused while either hover or focus still holds it', async () => {
    await show('Published')
    await stack().trigger('mouseenter')
    await stack().trigger('focusin')
    await stack().trigger('mouseleave')
    await elapse(TOAST_DURATION_MS * 2)
    expect(messages()).toEqual(['Published'])
  })

  describe('announcing progress without a toast', () => {
    async function announce(message: string): Promise<void> {
      useAnnouncer().announce(message)
      await nextTick()
    }

    it('says it in the same polite region, and shows nothing', async () => {
      await announce('Compiling line…')
      expect(region().text()).toBe('Compiling line…')
      expect(messages()).toEqual([])
    })

    it('says only the latest, since an older step is already over', async () => {
      await announce('Compiling line…')
      await announce('Line compiled')
      expect(region().text()).toBe('Line compiled')
    })

    it('says the same words again when they are announced again', async () => {
      await announce('Splash zone ready: 3 stations reached')
      const first = region().get('p').element
      await announce('Splash zone ready: 3 stations reached')
      expect(region().get('p').element).not.toBe(first)
    })

    it('leaves the region once a toast would have gone, so browse mode does not find it later', async () => {
      await announce('Line compiled')
      await elapse(TOAST_DURATION_MS)
      expect(region().text()).toBe('')
    })

    it('speaks alongside a toast rather than over it', async () => {
      await show('Published')
      await announce('Line compiled')
      expect(region().findAll('p').map((p) => p.text())).toEqual(['Published', 'Line compiled'])
    })
  })
})
