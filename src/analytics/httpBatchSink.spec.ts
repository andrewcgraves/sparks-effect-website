import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpBatchSink, httpBatchSink } from './httpBatchSink'
import type { HttpBatchSink } from './httpBatchSink'

describe('httpBatchSink (module export)', () => {
  it('is a plain AnalyticsSink function', () => {
    expect(typeof httpBatchSink).toBe('function')
  })
})

describe('createHttpBatchSink', () => {
  let instance: HttpBatchSink

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 204 } as Response)
    vi.useFakeTimers()
    instance = createHttpBatchSink()
  })

  afterEach(() => {
    instance.dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('does not POST immediately for a single event', () => {
    instance.sink({ type: 'page_view', path: '/' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('flushes after the batching interval elapses', async () => {
    instance.sink({ type: 'page_view', path: '/' })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/analytics/events')
    const initOpts = init as RequestInit
    expect(initOpts.method).toBe('POST')
    const headers = new Headers(initOpts.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(initOpts.body as string)).toEqual({
      events: [{ type: 'page_view', path: '/' }],
    })
  })

  it('batches multiple events fired before the interval elapses into one request', async () => {
    instance.sink({ type: 'page_view', path: '/' })
    instance.sink({ type: 'mode_toggle', mode: 'walk' })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string) as { events: unknown[] }
    expect(body.events).toHaveLength(2)
  })

  it('flushes immediately once the queue reaches its size cap, without waiting for the timer', async () => {
    for (let i = 0; i < 20; i++) {
      instance.sink({ type: 'page_view', path: `/${i}` })
    }
    // No timer advance: the 20th event alone must have triggered the flush.
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string) as { events: unknown[] }
    expect(body.events).toHaveLength(20)
  })

  it('starts a fresh batch after a flush', async () => {
    instance.sink({ type: 'page_view', path: '/first' })
    await vi.advanceTimersByTimeAsync(10_000)
    instance.sink({ type: 'page_view', path: '/second' })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(fetch).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string) as { events: unknown[] }
    expect(secondBody.events).toEqual([{ type: 'page_view', path: '/second' }])
  })

  it('respects VITE_API_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    instance.sink({ type: 'page_view', path: '/' })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.example.com/api/analytics/events')
  })

  it('swallows a rejected fetch without throwing', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    instance.sink({ type: 'page_view', path: '/' })

    await expect(vi.advanceTimersByTimeAsync(10_000)).resolves.not.toThrow()
  })
})

describe('createHttpBatchSink page-hide flush', () => {
  let instance: HttpBatchSink

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 204 } as Response)
  })

  afterEach(() => {
    instance.dispose()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('flushes via sendBeacon when the page becomes hidden', () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { ...navigator, sendBeacon })
    instance = createHttpBatchSink()

    instance.sink({ type: 'page_view', path: '/' })
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
    const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob]
    expect(url).toBe('http://localhost:8080/api/analytics/events')
    // text/plain, not application/json — see the comment in flushOnHide:
    // application/json is not CORS-safelisted and would force a preflight
    // the browser might not have time to complete before the page is gone.
    expect(blob.type).toBe('text/plain')
  })

  it('flushes via sendBeacon on pagehide', () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { ...navigator, sendBeacon })
    instance = createHttpBatchSink()

    instance.sink({ type: 'page_view', path: '/leaving' })
    window.dispatchEvent(new Event('pagehide'))

    expect(sendBeacon).toHaveBeenCalledTimes(1)
  })

  it('falls back to a keepalive fetch when sendBeacon is unavailable', () => {
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: undefined })
    instance = createHttpBatchSink()

    instance.sink({ type: 'page_view', path: '/' })
    window.dispatchEvent(new Event('pagehide'))

    expect(fetch).toHaveBeenCalledTimes(1)
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(init.keepalive).toBe(true)
  })

  it('does not send an empty batch on pagehide', () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { ...navigator, sendBeacon })
    instance = createHttpBatchSink()

    window.dispatchEvent(new Event('pagehide'))

    expect(sendBeacon).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('disposing an instance stops it from reacting to further page-hide events', () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { ...navigator, sendBeacon })
    instance = createHttpBatchSink()
    instance.sink({ type: 'page_view', path: '/' })

    instance.dispose()
    window.dispatchEvent(new Event('pagehide'))

    expect(sendBeacon).not.toHaveBeenCalled()
  })
})
