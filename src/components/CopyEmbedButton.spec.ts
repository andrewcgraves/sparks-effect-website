import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CopyEmbedButton from './CopyEmbedButton.vue'
import { mountSharedHosts } from '../test/sharedHosts'
import { testRouterAt } from '../test/router'
import { seriousA11yViolations } from '../test/axe'
import type { EmbedTarget } from '../embed/embedLinks'

describe('CopyEmbedButton', () => {
  let hosts: ReturnType<typeof mountSharedHosts>
  const execCommand = vi.fn()
  const writeText = vi.fn()

  beforeEach(() => {
    hosts = mountSharedHosts()
    execCommand.mockReset()
    writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
  })

  afterEach(() => {
    hosts.unmount()
    vi.unstubAllGlobals()
  })

  async function mountAt(path: string, target: EmbedTarget = { kind: 'scenario', slug: 'ca-hsr' }) {
    const router = await testRouterAt(path)
    const wrapper = mount(CopyEmbedButton, {
      props: { target, name: 'California High-Speed Rail' },
      global: { plugins: [router] },
      attachTo: document.body,
    })
    await wrapper.get('[data-testid="copy-embed"]').trigger('click')
    return wrapper
  }

  it('offers the code only once asked, as two snippets and a hint', async () => {
    const router = await testRouterAt('/scenario/ca-hsr')
    const closed = mount(CopyEmbedButton, {
      props: { target: { kind: 'scenario', slug: 'ca-hsr' }, name: 'X' },
      global: { plugins: [router] },
    })
    expect(closed.get('[data-testid="copy-embed"]').text()).toBe('Copy embed code')
    expect(closed.find('[data-testid="copy-embed-options"]').exists()).toBe(false)

    const open = await mountAt('/scenario/ca-hsr')
    expect(open.get('[data-testid="copy-embed"]').attributes('aria-expanded')).toBe('true')
    const labels = open.findAll('[data-testid="copy-embed-option"] [data-testid="copy-embed-label"]').map((l) => l.text())
    expect(labels).toEqual(['Map only', 'With controls'])
    expect(open.get('[data-testid="copy-embed-options"]').text()).toMatch(/transit/i)
  })

  it('copies the map-only snippet with the plot on screen, and says so', async () => {
    const wrapper = await mountAt('/scenario/ca-hsr?at=37.3382,-121.8863&mode=transit&mins=60')
    await wrapper.get('[data-testid="copy-embed-map-only"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(
      `<iframe src="${window.location.origin}/embed/scenario/ca-hsr?at=37.3382%2C-121.8863&amp;mode=transit&amp;mins=60"\n` +
      '  width="100%" height="480" loading="lazy" style="border:0"\n' +
      '  title="California High-Speed Rail splash zone on Sparks Effect"></iframe>',
    )
    expect(hosts.toasts()).toEqual(['Embed code copied'])
  })

  it('copies the snippet with controls, naming no plot when none is drawn', async () => {
    const wrapper = await mountAt('/services/northbound-express', { kind: 'services', slug: 'northbound-express' })
    await wrapper.get('[data-testid="copy-embed-controls"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0][0]).toContain(`src="${window.location.origin}/embed/services/northbound-express?controls=1"`)
  })

  it('falls back to a selection, and says when nothing could copy', async () => {
    vi.stubGlobal('navigator', {})
    execCommand.mockReturnValue(false)
    const wrapper = await mountAt('/scenario/ca-hsr')
    await wrapper.get('[data-testid="copy-embed-map-only"]').trigger('click')
    await flushPromises()

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(hosts.toasts()).toEqual(["Couldn't copy the embed code. Select it above and copy it by hand."])
  })

  it('has no serious or critical accessibility violations when open', async () => {
    const wrapper = await mountAt('/scenario/ca-hsr')
    expect(await seriousA11yViolations(wrapper.element)).toEqual([])
  })
})
