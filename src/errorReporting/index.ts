export interface ErrorReport {
  error: unknown
  context: Record<string, string>
}

export type ErrorSink = (report: ErrorReport) => void

// Mirrors the analytics sink: nothing leaves the browser until main.ts, in a
// production build, points this at the error tracker. Dev keeps errors in the
// console, where Vue and the browser already put them.
let _sink: ErrorSink = () => {}

export function configureErrorSink(sink: ErrorSink): void {
  _sink = sink
}

export function reportError(error: unknown, context: Record<string, string> = {}): void {
  _sink({ error, context })
}
