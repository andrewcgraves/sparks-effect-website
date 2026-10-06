import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { ROUTING_STATUS_POLL_MS, ROUTING_STATUS_TIMEOUT_MS, useRoutingStatus } from './useRoutingStatus'

function answer(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: async () => body } as Response
}

const scopes: EffectScope[] = []

function subscribe() {
  const scope = effectScope()
  scopes.push(scope)
  return { scope, ...scope.run(() => useRoutingStatus())! }
}

describe('useRoutingStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    for (const scope of scopes.splice(0)) scope.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('polls once for the tab however many components ask', async () => {
    vi.mocked(fetch).mockResolvedValue(answer({ status: 'offline', oldest_queued_secs: 140, inflight: 3 }))

    const first = subscribe()
    const second = subscribe()
    await flushPromises()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/routing/status')
    expect(first.status.value).toBe('offline')
    expect(second.status.value).toBe('offline')
  })

  it('asks again every minute, and picks up the change', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(answer({ status: 'ok' }))
      .mockResolvedValueOnce(answer({ status: 'degraded' }))

    const { status } = subscribe()
    await flushPromises()
    expect(status.value).toBe('ok')

    await vi.advanceTimersByTimeAsync(ROUTING_STATUS_POLL_MS)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(status.value).toBe('degraded')
  })

  it('asks again when the tab regains focus', async () => {
    vi.mocked(fetch).mockResolvedValue(answer({ status: 'ok' }))
    subscribe()
    await flushPromises()

    window.dispatchEvent(new Event('focus'))
    await flushPromises()

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reads a failing endpoint as ok', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(answer({ status: 'offline' }))
      .mockResolvedValueOnce(answer({ error: 'boom' }, false))
    const { status } = subscribe()
    await flushPromises()
    expect(status.value).toBe('offline')

    await vi.advanceTimersByTimeAsync(ROUTING_STATUS_POLL_MS)

    expect(status.value).toBe('ok')
  })

  it('reads a status it does not know as ok', async () => {
    vi.mocked(fetch).mockResolvedValue(answer({ status: 'on-fire' }))
    const { status } = subscribe()
    await flushPromises()

    expect(status.value).toBe('ok')
  })

  it('reads a slow endpoint as ok, and does not pile requests up behind it', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(answer({ status: 'offline' }))
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(answer({ status: 'degraded' }))
    const { status } = subscribe()
    await flushPromises()
    expect(status.value).toBe('offline')

    await vi.advanceTimersByTimeAsync(ROUTING_STATUS_POLL_MS)
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(ROUTING_STATUS_TIMEOUT_MS)
    expect(status.value).toBe('ok')

    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(status.value).toBe('degraded')
  })

  it('asks afresh for the next page even while the last page’s answer is still out', async () => {
    let answerLeaving: (value: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReturnValueOnce(new Promise((resolve) => (answerLeaving = resolve)))
      .mockResolvedValueOnce(answer({ status: 'offline' }))
    const leaving = subscribe()
    leaving.scope.stop()

    const arriving = subscribe()
    await flushPromises()
    answerLeaving(answer({ status: 'ok' }))
    await flushPromises()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(arriving.status.value).toBe('offline')
  })

  it('stops asking once no page that plots is open', async () => {
    vi.mocked(fetch).mockResolvedValue(answer({ status: 'ok' }))
    const first = subscribe()
    const second = subscribe()
    await flushPromises()

    first.scope.stop()
    await vi.advanceTimersByTimeAsync(ROUTING_STATUS_POLL_MS)
    expect(fetch).toHaveBeenCalledTimes(2)

    second.scope.stop()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(ROUTING_STATUS_POLL_MS * 3)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
