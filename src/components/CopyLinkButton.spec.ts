import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CopyLinkButton from './CopyLinkButton.vue'
import { mountSharedHosts } from '../test/sharedHosts'

describe('CopyLinkButton', () => {
  let hosts: ReturnType<typeof mountSharedHosts>
  const execCommand = vi.fn()

  beforeEach(() => {
    hosts = mountSharedHosts()
    window.history.replaceState(null, '', '/scenario/ca-hsr?at=37.3382,-121.8863&mode=transit&mins=60')
    execCommand.mockReset()
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
  })

  afterEach(() => {
    hosts.unmount()
    vi.unstubAllGlobals()
  })

  async function click() {
    const wrapper = mount(CopyLinkButton)
    await wrapper.get('[data-testid="copy-link"]').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('copies the current URL and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await click()
    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(window.location.href).toContain('at=37.3382,-121.8863&mode=transit&mins=60')
    expect(execCommand).not.toHaveBeenCalled()
    expect(hosts.toasts()).toEqual(['Link copied'])
  })

  it('falls back to copying a selection when there is no clipboard', async () => {
    vi.stubGlobal('navigator', {})
    let selected = ''
    execCommand.mockImplementation(() => {
      const field = document.querySelector('textarea')
      selected = field?.value.slice(field.selectionStart, field.selectionEnd) ?? ''
      return true
    })
    await click()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(selected).toBe(window.location.href)
    expect(document.querySelector('textarea')).toBeNull()
    expect(hosts.toasts()).toEqual(['Link copied'])
  })

  it('falls back when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    execCommand.mockReturnValue(true)
    await click()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(hosts.toasts()).toEqual(['Link copied'])
  })

  it('tells the user to copy it themselves when nothing can copy', async () => {
    vi.stubGlobal('navigator', {})
    execCommand.mockReturnValue(false)
    await click()
    expect(hosts.toasts()).toEqual(["Couldn't copy the link. Copy it from the address bar."])
  })
})
