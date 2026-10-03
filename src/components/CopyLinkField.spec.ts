import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const toast = vi.fn()
vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: toast }) }))

import CopyLinkField from './CopyLinkField.vue'

describe('CopyLinkField', () => {
  beforeEach(() => {
    toast.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mountField() {
    return mount(CopyLinkField, { props: { url: 'https://site/set-password?token=t', label: 'Invite link' } })
  }

  it('shows the link, labelled, read-only', () => {
    const input = mountField().get('input')
    expect((input.element as HTMLInputElement).value).toBe('https://site/set-password?token=t')
    expect(input.attributes('aria-label')).toBe('Invite link')
    expect(input.attributes('readonly')).toBeDefined()
  })

  it('copies the link and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mountField()

    await wrapper.get('[data-testid="copy-link"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('https://site/set-password?token=t')
    expect(toast).toHaveBeenCalledWith('Link copied')
  })

  it('falls back to copying by hand when there is no clipboard', async () => {
    vi.stubGlobal('navigator', {})
    const wrapper = mountField()

    await wrapper.get('[data-testid="copy-link"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="copy-link-failed"]').exists()).toBe(true)
    expect(toast).not.toHaveBeenCalled()
  })
})
