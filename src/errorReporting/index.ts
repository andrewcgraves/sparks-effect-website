import type { App } from 'vue'

export interface ErrorReport {
  error: unknown
  context: Record<string, string>
}

export type ErrorSink = (report: ErrorReport) => void

// Mirrors the analytics sink: nothing leaves the browser until main.ts, in a
// production build, points this at the error tracker. Dev keeps errors in the
// console, where Vue and the browser already put them.
let _sink: ErrorSink = () => {}
let _pending: ErrorReport[] = []

// The tracker loads after first paint (SPA-493), so what goes wrong before it
// arrives is held here and handed over when it does.
export function bufferErrorReports(): void {
  _pending = []
  _sink = (report) => _pending.push(report)
}

export function configureErrorSink(sink: ErrorSink): void {
  const pending = _pending
  _pending = []
  _sink = sink
  for (const report of pending) sink(report)
}

export function reportError(error: unknown, context: Record<string, string> = {}): void {
  _sink({ error, context })
}

// Installed before mount, so a first render that throws is reported too.
// Replacing Vue's handler also replaces its console output, so it is kept.
export function reportVueErrors(app: App): void {
  app.config.errorHandler = (error, _instance, info) => {
    reportError(error, { vue_info: info })
    console.error(error)
  }
}

// Faro's own instrumentation takes these over once it starts, so the caller
// releases this the moment it does: holding on would report each one twice.
export function captureUncaughtErrors(target: Window): () => void {
  const onError = (event: ErrorEvent) => reportError(event.error ?? event.message, { source: 'window.error' })
  const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason, { source: 'unhandledrejection' })
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
