// Correlation id sent to our own backend as X-Trace-Id, so a request (or a
// job) can be followed through the API's logs — and, for isochrones, through
// the routing worker and Valhalla as well (SPA-195). Not used for third-party
// APIs (e.g. Nominatim): there is nothing of ours to correlate.
//
// Grain (SPA-205):
//
// * One-shot reads mint a fresh id per HTTP call (`apiRequest` does this
//   when the caller did not supply a header; so do the standalone `fetch()`
//   helpers in scenarios.ts / prerenderedIsochrones.ts). Grepping for that
//   id reconstructs exactly one request/response.
// * An enqueue-then-poll job is one logical unit of work, not one HTTP call.
//   Mint once at the start of the job (`enqueueIsochrone`, `useCompileJob`)
//   and send that same id on the enqueue and every subsequent poll. Grepping
//   for that id then reconstructs the whole job — API access logs for the
//   polls included — rather than only the enqueue (the only request whose id
//   currently reaches the routing worker).
//
// `apiRequest` still mints per request when no header is supplied, so
// unrelated traffic stays uniquely identifiable. An explicit caller header
// always wins.

export const TRACE_HEADER = 'X-Trace-Id'

export function newTraceId(): string {
  return crypto.randomUUID()
}

// Headers carrying `id` as X-Trace-Id, for spreading into fetch / apiRequest.
export function traceHeaders(id: string): { [TRACE_HEADER]: string } {
  return { [TRACE_HEADER]: id }
}
