import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'
import { useConfirm, useConfirmHost, type ConfirmOptions } from '../composables/useConfirm'

const DESTRUCTIVE: ConfirmOptions = {
  title: 'Remove this stop?',
  body: 'It leaves the route for good.',
  confirmLabel: 'Remove stop',
  destructive: true,
}

describe('ConfirmDialog', () => {
  let host: VueWrapper
  let trigger: HTMLButtonElement

  beforeEach(() => {
    trigger = document.createElement('button')
    trigger.textContent = 'Remove'
    document.body.appendChild(trigger)
    trigger.focus()
    host = mount(ConfirmDialog, { attachTo: document.body })
  })

  afterEach(() => {
    useConfirmHost().settle(false)
    host.unmount()
    trigger.remove()
  })

  function dialog(): HTMLDialogElement {
    return host.get('[data-testid="confirm-dialog"]').element as HTMLDialogElement
  }

  async function ask(options: ConfirmOptions = DESTRUCTIVE): Promise<{ answer: Promise<boolean> }> {
    const answer = useConfirm().confirm(options)
    await flushPromises()
    return { answer }
  }

  function key(name: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true })
    ;(document.activeElement ?? dialog()).dispatchEvent(event)
    return event
  }

  it('stays closed until asked', () => {
    expect(dialog().open).toBe(false)
  })

  it('opens with the title and body, labelled and described by them', async () => {
    await ask()
    expect(dialog().open).toBe(true)
    const title = document.getElementById(dialog().getAttribute('aria-labelledby')!)
    const body = document.getElementById(dialog().getAttribute('aria-describedby')!)
    expect(title?.textContent).toContain('Remove this stop?')
    expect(body?.textContent).toContain('It leaves the route for good.')
    expect(host.get('[data-testid="confirm-dialog-confirm"]').text()).toBe('Remove stop')
  })

  it('resolves true when confirmed, and closes', async () => {
    const { answer } = await ask()
    await host.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
    await expect(answer).resolves.toBe(true)
    expect(dialog().open).toBe(false)
  })

  it('resolves false when cancelled, and closes', async () => {
    const { answer } = await ask()
    await host.get('[data-testid="confirm-dialog-cancel"]').trigger('click')
    await expect(answer).resolves.toBe(false)
    expect(dialog().open).toBe(false)
  })

  it('resolves false on Escape', async () => {
    const { answer } = await ask()
    const event = key('Escape')
    await flushPromises()
    await expect(answer).resolves.toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(dialog().open).toBe(false)
  })

  it('names the safe choice with the caller\'s label, or "Cancel"', async () => {
    void ask({ ...DESTRUCTIVE, cancelLabel: 'Keep stop' })
    await flushPromises()
    expect(host.get('[data-testid="confirm-dialog-cancel"]').text()).toBe('Keep stop')
    await host.get('[data-testid="confirm-dialog-cancel"]').trigger('click')
    void ask(DESTRUCTIVE)
    await flushPromises()
    expect(host.get('[data-testid="confirm-dialog-cancel"]').text()).toBe('Cancel')
  })

  it.each([true, false])('focuses the safe choice on open (destructive: %s)', async (destructive) => {
    await ask({ ...DESTRUCTIVE, destructive })
    expect(document.activeElement).toBe(host.get('[data-testid="confirm-dialog-cancel"]').element)
  })

  it('resolves false when the browser closes the dialog itself', async () => {
    const { answer } = await ask()
    dialog().close()
    await expect(answer).resolves.toBe(false)
  })

  it('styles a destructive confirm differently from an ordinary one', async () => {
    await ask()
    const destructiveClass = host.get('[data-testid="confirm-dialog-confirm"]').classes()
    await host.get('[data-testid="confirm-dialog-cancel"]').trigger('click')
    await ask({ ...DESTRUCTIVE, destructive: false })
    expect(host.get('[data-testid="confirm-dialog-confirm"]').classes()).not.toEqual(destructiveClass)
  })

  it('traps Tab inside the dialog, both ways', async () => {
    await ask()
    const cancel = host.get('[data-testid="confirm-dialog-cancel"]').element
    const confirm = host.get('[data-testid="confirm-dialog-confirm"]').element
    const buttons = [...dialog().querySelectorAll('button')]
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    expect([first, last]).toEqual(expect.arrayContaining([cancel, confirm]))

    last.focus()
    expect(key('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    expect(key('Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })

  it('leaves Tab alone between the dialog\'s own buttons', async () => {
    await ask()
    const first = dialog().querySelectorAll('button')[0]
    first.focus()
    expect(key('Tab').defaultPrevented).toBe(false)
  })

  it('returns focus to whatever had it before asking', async () => {
    const { answer } = await ask()
    expect(document.activeElement).not.toBe(trigger)
    await host.get('[data-testid="confirm-dialog-cancel"]').trigger('click')
    await answer
    await flushPromises()
    expect(document.activeElement).toBe(trigger)
  })

  it('declines an unanswered ask when a new one replaces it', async () => {
    const { answer: first } = await ask()
    const { answer: second } = await ask({ ...DESTRUCTIVE, title: 'Unpublish this service?' })
    await expect(first).resolves.toBe(false)
    expect(dialog().open).toBe(true)
    expect(dialog().textContent).toContain('Unpublish this service?')
    await host.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
    await expect(second).resolves.toBe(true)
  })

  describe('with a note', () => {
    const UNPUBLISH = { ...DESTRUCTIVE, title: 'Unpublish Coast Line?', confirmLabel: 'Unpublish', noteLabel: 'Reason' }

    async function askWithNote(): Promise<{ answer: Promise<string | null> }> {
      const answer = useConfirm().confirmWithNote(UNPUBLISH)
      await flushPromises()
      return { answer }
    }

    function note() {
      return host.get('[data-testid="confirm-dialog-note"]')
    }

    it('shows no note field for a plain confirm', async () => {
      await ask()
      expect(host.find('[data-testid="confirm-dialog-note"]').exists()).toBe(false)
    })

    it('labels the note field with the caller\'s label, and focuses it on open', async () => {
      await askWithNote()
      const field = note().element as HTMLTextAreaElement
      expect(field.labels?.[0]?.textContent).toContain('Reason')
      expect(document.activeElement).toBe(field)
    })

    it('resolves with the trimmed note when confirmed', async () => {
      const { answer } = await askWithNote()
      await note().setValue('  Reported as spam  ')
      await host.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
      await expect(answer).resolves.toBe('Reported as spam')
    })

    it('resolves with an empty note when confirmed without one', async () => {
      const { answer } = await askWithNote()
      await host.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
      await expect(answer).resolves.toBe('')
    })

    it('resolves null when cancelled', async () => {
      const { answer } = await askWithNote()
      await note().setValue('never mind')
      await host.get('[data-testid="confirm-dialog-cancel"]').trigger('click')
      await expect(answer).resolves.toBeNull()
    })

    it('starts each ask with an empty note', async () => {
      const { answer } = await askWithNote()
      await note().setValue('first')
      await host.get('[data-testid="confirm-dialog-cancel"]').trigger('click')
      await answer
      await askWithNote()
      expect((note().element as HTMLTextAreaElement).value).toBe('')
    })

    it('keeps the note field inside the Tab cycle', async () => {
      await askWithNote()
      const field = note().element
      const buttons = [...dialog().querySelectorAll('button')]
      buttons[buttons.length - 1].focus()
      expect(key('Tab').defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(field)
      expect(key('Tab', true).defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(buttons[buttons.length - 1])
    })
  })
})
