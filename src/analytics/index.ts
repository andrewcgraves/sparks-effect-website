import { consoleSink, noopSink } from './sinks'
import type { AnalyticsSink } from './types'

let _sink: AnalyticsSink = import.meta.env.DEV ? consoleSink : noopSink

export function configureSink(sink: AnalyticsSink): void {
  _sink = sink
}

export function trackPageView(path: string): void {
  _sink({ type: 'page_view', path })
}

export function trackOriginSearch(query: string, resultCount: number): void {
  _sink({ type: 'origin_search', query, resultCount })
}

export function trackModeToggle(mode: string): void {
  _sink({ type: 'mode_toggle', mode })
}

export function trackIsochroneRequest(travelMode: string, durationMinutes: number): void {
  _sink({ type: 'isochrone_request', travelMode, durationMinutes })
}

export function trackIsochroneError(travelMode: string, durationMinutes: number, status: number | null): void {
  _sink({ type: 'isochrone_error', travelMode, durationMinutes, status })
}
