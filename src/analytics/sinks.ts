import type { AnalyticsSink } from './types'

export const noopSink: AnalyticsSink = () => {}

export const consoleSink: AnalyticsSink = (event) => {
  console.log('[analytics]', event)
}
