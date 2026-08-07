// The real production sink (SPA-218): batches tracked events and POSTs them
// to the API's public ingestion endpoint, replacing the noopSink that has
// discarded every event in production until now.
import type { AnalyticsEvent, AnalyticsSink } from './types'
import { apiBase } from '../api/authoring/client'

const ingestPath = '/api/analytics/events'

// flushIntervalMs and maxQueueSize bound how long an event can sit unsent
// and how big one batch gets. Neither needs to be small: this is
// product-usage telemetry, not something a human is watching arrive live.
const flushIntervalMs = 10_000
const maxQueueSize = 20

export interface HttpBatchSink {
  sink: AnalyticsSink
  // dispose removes the page-lifecycle listeners this instance installed.
  // The production singleton below never calls it — it lives for the app's
  // whole lifetime — but a test creating its own instance needs a way to
  // tear it down, or listeners from one test's instance would still be
  // attached (and firing, against whatever mocks are active) in the next.
  dispose: () => void
}

// createHttpBatchSink returns an independent sink instance: its own queue,
// its own flush timer, its own page-lifecycle listeners. A factory rather
// than a bare module-level singleton so each test can create (and dispose)
// its own, instead of every test sharing one global queue.
export function createHttpBatchSink(): HttpBatchSink {
  let queue: AnalyticsEvent[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function takeQueue(): AnalyticsEvent[] {
    const batch = queue
    queue = []
    return batch
  }

  function postBatch(batch: AnalyticsEvent[]): void {
    // Fire-and-forget: a dropped analytics batch must never surface as an
    // app-visible error, so failures are swallowed rather than retried — a
    // retry would just requeue events behind the next flush and risk an
    // unbounded backlog if the endpoint stays unreachable.
    void fetch(`${apiBase()}${ingestPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    }).catch(() => {})
  }

  function flush(): void {
    if (queue.length === 0) return
    postBatch(takeQueue())
  }

  function scheduleFlush(): void {
    if (flushTimer != null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, flushIntervalMs)
  }

  // flushOnHide sends whatever is queued the instant the page is about to go
  // away. Without this, a tab closed mid-interval loses its queued events
  // entirely — the flush timer never gets to fire. navigator.sendBeacon is
  // used because a fetch kicked off during unload is not reliably delivered
  // across browsers; sendBeacon exists for exactly this.
  function flushOnHide(): void {
    if (queue.length === 0) return
    const batch = takeQueue()
    const body = JSON.stringify({ events: batch })
    // The Blob's type is deliberately text/plain, not application/json: the
    // server parses the bytes as JSON regardless of what this label says, but
    // application/json is not a CORS-safelisted content type and would force
    // a preflight OPTIONS round trip before the browser sends the beacon
    // itself. During page teardown there is no guarantee two round trips
    // both complete before the process is gone; text/plain keeps this a
    // CORS "simple request" so the beacon is the only request that has to
    // land.
    if (
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(`${apiBase()}${ingestPath}`, new Blob([body], { type: 'text/plain' }))
    ) {
      return
    }
    // Fall back to a best-effort keepalive fetch when sendBeacon is
    // unavailable, or declines (e.g. the payload exceeds the browser's
    // queued size limit) — either way the batch should not be dropped.
    void fetch(`${apiBase()}${ingestPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') flushOnHide()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', flushOnHide)

  const sink: AnalyticsSink = (event) => {
    queue.push(event)
    if (queue.length >= maxQueueSize) {
      if (flushTimer != null) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      flush()
      return
    }
    scheduleFlush()
  }

  function dispose(): void {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', flushOnHide)
    if (flushTimer != null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
  }

  return { sink, dispose }
}

export const httpBatchSink: AnalyticsSink = createHttpBatchSink().sink
