// One id per outgoing request to our own backend, so a request can be
// followed through the API's logs by its X-Trace-Id header. Not used for
// third-party APIs (e.g. Nominatim) — there is nothing of ours to correlate.
export function newTraceId(): string {
  return crypto.randomUUID()
}
