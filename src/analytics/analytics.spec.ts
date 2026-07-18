import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consoleSink, noopSink } from './sinks'
import { configureSink, trackIsochroneError, trackIsochroneRequest, trackModeToggle, trackOriginSearch, trackPageView } from './index'
import type { AnalyticsEvent } from './types'

describe('sinks', () => {
  it('noopSink does nothing', () => {
    expect(() => noopSink({ type: 'page_view', path: '/' })).not.toThrow()
  })

  it('consoleSink logs to console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleSink({ type: 'page_view', path: '/' })
    expect(spy).toHaveBeenCalledWith('[analytics]', { type: 'page_view', path: '/' })
    spy.mockRestore()
  })
})

describe('analytics helpers', () => {
  const captured: AnalyticsEvent[] = []
  const captureSink = (event: AnalyticsEvent) => { captured.push(event) }

  beforeEach(() => {
    captured.length = 0
    configureSink(captureSink)
  })

  afterEach(() => {
    configureSink(noopSink)
  })

  it('trackPageView emits a page_view event with path', () => {
    trackPageView('/')
    expect(captured).toEqual([{ type: 'page_view', path: '/' }])
  })

  it('trackOriginSearch emits an origin_search event', () => {
    trackOriginSearch('downtown', 5)
    expect(captured).toEqual([{ type: 'origin_search', query: 'downtown', resultCount: 5 }])
  })

  it('trackModeToggle emits a mode_toggle event', () => {
    trackModeToggle('walking')
    expect(captured).toEqual([{ type: 'mode_toggle', mode: 'walking' }])
  })

  it('trackIsochroneRequest emits an isochrone_request event', () => {
    trackIsochroneRequest('cycling', 30)
    expect(captured).toEqual([{ type: 'isochrone_request', travelMode: 'cycling', durationMinutes: 30 }])
  })

  it('trackIsochroneError emits an isochrone_error event with an HTTP status', () => {
    trackIsochroneError('walking', 45, 500)
    expect(captured).toEqual([{ type: 'isochrone_error', travelMode: 'walking', durationMinutes: 45, status: 500 }])
  })

  it('trackIsochroneError emits a null status for connectivity failures', () => {
    trackIsochroneError('driving', 60, null)
    expect(captured).toEqual([{ type: 'isochrone_error', travelMode: 'driving', durationMinutes: 60, status: null }])
  })

  it('multiple events accumulate in order', () => {
    trackPageView('/map')
    trackModeToggle('driving')
    expect(captured).toHaveLength(2)
    expect(captured[0].type).toBe('page_view')
    expect(captured[1].type).toBe('mode_toggle')
  })
})
