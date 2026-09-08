export const TRACE_HEADER = 'X-Trace-Id'

export function newTraceId(): string {
  return crypto.randomUUID()
}

export function traceHeaders(id: string): { [TRACE_HEADER]: string } {
  return { [TRACE_HEADER]: id }
}
