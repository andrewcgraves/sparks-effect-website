export type AnalyticsEvent =
  | { type: 'page_view'; path: string }
  | { type: 'origin_search'; query: string; resultCount: number }
  | { type: 'mode_toggle'; mode: string }
  | { type: 'isochrone_request'; travelMode: string; durationMinutes: number }

export type AnalyticsSink = (event: AnalyticsEvent) => void
