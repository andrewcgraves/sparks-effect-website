import { track } from '@vercel/analytics'
import type { AnalyticsSink } from './types'

export const noopSink: AnalyticsSink = () => {}

export const consoleSink: AnalyticsSink = (event) => {
  console.log('[analytics]', event)
}

/**
 * Vercel collects page views on every plan but bills `track()` custom events as
 * a Pro/Enterprise feature. On a Hobby project set `VITE_VERCEL_CUSTOM_EVENTS=off`
 * so the custom events stop here, in one named place, rather than being posted to
 * an endpoint that will not keep them. Page views are unaffected either way —
 * `<Analytics />` in `App.vue` reports those, not this sink.
 */
function customEventsEnabled(): boolean {
  return (import.meta.env.VITE_VERCEL_CUSTOM_EVENTS as string | undefined) !== 'off'
}

/**
 * Sends our events to Vercel Web Analytics as custom events. Page views are not
 * its job: `<Analytics />` already reports one per route change.
 */
export const vercelSink: AnalyticsSink = (event) => {
  // Dropped rather than forwarded. `<Analytics />` reports a page view on every
  // route change, so passing the router guard's event on as well would count
  // each navigation twice. The guard stays as it is — it feeds any other sink.
  if (event.type === 'page_view') return

  if (!customEventsEnabled()) return

  switch (event.type) {
    case 'mode_toggle':
      track('mode_toggle', { mode: event.mode })
      break
    case 'isochrone_request':
      track('isochrone_request', {
        travelMode: event.travelMode,
        durationMinutes: event.durationMinutes,
      })
      break
    case 'isochrone_error':
      track('isochrone_error', {
        travelMode: event.travelMode,
        durationMinutes: event.durationMinutes,
        status: event.status,
      })
      break
    case 'origin_search':
      // `query` is an address someone typed, so it stays in the browser: only
      // the non-identifying result count leaves.
      track('origin_search', { resultCount: event.resultCount })
      break
  }
}
