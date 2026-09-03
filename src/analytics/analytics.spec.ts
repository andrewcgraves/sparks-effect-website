// @vitest-environment node
// No DOM in this file. See the environment note in vite.config.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consoleSink, noopSink, vercelSink } from './sinks'
import { configureSink, trackIsochroneError, trackIsochroneRequest, trackModeToggle, trackOriginSearch, trackPageView } from './index'
import type { AnalyticsEvent } from './types'

vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}))

import { track } from '@vercel/analytics'

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

describe('vercelSink', () => {
  beforeEach(() => {
    vi.mocked(track).mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('drops page_view, which <Analytics /> already reports', () => {
    vercelSink({ type: 'page_view', path: '/scenario/orange-line' })
    expect(track).not.toHaveBeenCalled()
  })

  it('maps mode_toggle to a track call', () => {
    vercelSink({ type: 'mode_toggle', mode: 'walking' })
    expect(track).toHaveBeenCalledWith('mode_toggle', { mode: 'walking' })
  })

  it('maps isochrone_request to a track call', () => {
    vercelSink({ type: 'isochrone_request', travelMode: 'cycling', durationMinutes: 30 })
    expect(track).toHaveBeenCalledWith('isochrone_request', { travelMode: 'cycling', durationMinutes: 30 })
  })

  it('maps isochrone_error to a track call, HTTP status included', () => {
    vercelSink({ type: 'isochrone_error', travelMode: 'walking', durationMinutes: 45, status: 500 })
    expect(track).toHaveBeenCalledWith('isochrone_error', { travelMode: 'walking', durationMinutes: 45, status: 500 })
  })

  it('maps isochrone_error with a null status for connectivity failures', () => {
    vercelSink({ type: 'isochrone_error', travelMode: 'driving', durationMinutes: 60, status: null })
    expect(track).toHaveBeenCalledWith('isochrone_error', { travelMode: 'driving', durationMinutes: 60, status: null })
  })

  it('never forwards the origin_search query text', () => {
    vercelSink({ type: 'origin_search', query: '221B Baker Street', resultCount: 3 })
    expect(track).toHaveBeenCalledWith('origin_search', { resultCount: 3 })
  })

  it('sends no custom events when they are turned off for the plan', () => {
    vi.stubEnv('VITE_VERCEL_CUSTOM_EVENTS', 'off')
    vercelSink({ type: 'mode_toggle', mode: 'transit' })
    vercelSink({ type: 'isochrone_request', travelMode: 'transit', durationMinutes: 75 })
    expect(track).not.toHaveBeenCalled()
  })

  it('is installable as the sink the track helpers use', () => {
    configureSink(vercelSink)
    trackModeToggle('driving')
    trackPageView('/')
    configureSink(noopSink)
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('mode_toggle', { mode: 'driving' })
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
