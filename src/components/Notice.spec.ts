import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Notice from './Notice.vue'
import { seriousA11yViolations } from '../test/axe'

type NoticeProps = { tone: 'caution' | 'error'; size: 'banner' | 'inline' }

function mountNotice(props: NoticeProps, options: { attachTo?: HTMLElement } = {}) {
  return mount(Notice, { props, slots: { default: 'Live routing is offline right now.' }, ...options })
}

describe('Notice', () => {
  it('gives a caution in apricot, announced politely', () => {
    const notice = mountNotice({ tone: 'caution', size: 'banner' })
    expect(notice.classes()).toEqual(expect.arrayContaining(['border-apricot', 'bg-apricot/15', 'text-ink']))
    expect(notice.attributes('role')).toBe('status')
    expect(notice.find('.t-error').exists()).toBe(false)
    expect(notice.text()).toBe('Live routing is offline right now.')
  })

  it('gives an error in a red frame, announced at once, with the message in the error role', () => {
    const notice = mountNotice({ tone: 'error', size: 'banner' })
    expect(notice.classes()).toEqual(expect.arrayContaining(['border-error', 'bg-error/5', 'text-ink']))
    expect(notice.classes()).not.toContain('border-apricot')
    expect(notice.attributes('role')).toBe('alert')
    expect(notice.get('.t-error').text()).toBe('Live routing is offline right now.')
  })

  it('sizes a banner as a box and an inline notice as a field', () => {
    const banner = mountNotice({ tone: 'caution', size: 'banner' })
    expect(banner.classes()).toEqual(expect.arrayContaining(['rounded-(--radius-box)', 'p-4', 't-body']))

    const inline = mountNotice({ tone: 'caution', size: 'inline' })
    expect(inline.classes()).toEqual(expect.arrayContaining(['rounded-(--radius-field)', 'p-3']))
    expect(inline.classes()).not.toContain('p-4')
  })

  it.each<NoticeProps['tone']>(['caution', 'error'])('has no serious or critical accessibility violations as a %s', async (tone) => {
    const notice = mountNotice({ tone, size: 'inline' }, { attachTo: document.body })
    expect(await seriousA11yViolations(notice)).toEqual([])
    notice.unmount()
  })
})
