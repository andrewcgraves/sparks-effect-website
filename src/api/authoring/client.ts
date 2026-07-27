// Shared HTTP helpers for the authoring API client.
import { STOP_PLACEMENT_FAULT_KINDS } from './types'
import type { FaultedStop, StopPlacementFault } from './types'

// Resolves the API base URL, overridable via VITE_API_BASE_URL.
export function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
}

// A failed API response, carrying the status so callers can branch on it —
// notably 401, which means the session is gone rather than the network.
//
// code is the handful of 409s and validation failures the server tags with a
// machine-readable discriminator (e.g. "stale_graph") so a caller can act on
// them instead of just displaying the message; most error bodies carry none.
//
// detail is the payload for the smaller set where knowing *that* it failed is
// not enough to act. Its shape is fixed by the code, and it is deliberately
// unknown here: the transport has no business knowing which codes carry what,
// so a caller reads it only through a narrowing function for a code it
// recognises, of which stopPlacementFault is the first.
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly detail?: unknown

  constructor(message: string, status: number, code?: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

// The code on a 422 whose detail names the stops that broke a placement rule.
export const STOP_PLACEMENT_ERROR_CODE = 'stop_placement'

function isFaultedStop(value: unknown): value is FaultedStop {
  const stop = value as Partial<FaultedStop> | null
  return (
    typeof stop?.seq === 'number' &&
    typeof stop.name === 'string' &&
    typeof stop.slug === 'string' &&
    typeof stop.chainage_m === 'number' &&
    typeof stop.offset_m === 'number'
  )
}

// Reads a stop-placement fault out of a rejected write, or null when there
// isn't one to read.
//
// Null is the answer for everything that is not a fault this build can attribute
// to specific rows — a different code, a kind we have never heard of, a detail
// whose shape doesn't hold up — because the caller's fallback is the same in
// every case: show the message and flag nothing. That is strictly better than
// pointing at the wrong row, and it is what makes the server free to add a
// third fault kind without breaking anyone.
//
// This replaced SPA-146's regular expressions over the message text, where a
// rewording server-side silently cost the authoring form its per-stop feedback.
export function stopPlacementFault(err: unknown): StopPlacementFault | null {
  if (!(err instanceof ApiError) || err.code !== STOP_PLACEMENT_ERROR_CODE) return null

  const detail = err.detail as Partial<StopPlacementFault> | null
  if (typeof detail !== 'object' || detail === null) return null

  // Only these two decide whether the fault can be pinned to rows, so only
  // these two are required. Insisting on the descriptive fields as well would
  // throw away a perfectly attributable fault over a value nothing reads.
  const kind = STOP_PLACEMENT_FAULT_KINDS.find((known) => known === detail.fault)
  if (!kind) return null
  if (!Array.isArray(detail.stops) || !detail.stops.every(isFaultedStop)) return null

  return {
    fault: kind,
    route_slug: typeof detail.route_slug === 'string' ? detail.route_slug : undefined,
    threshold_m: typeof detail.threshold_m === 'number' ? detail.threshold_m : undefined,
    stops: detail.stops,
  }
}

// Supplies the current bearer token, or null when signed out.
export type AuthTokenProvider = () => string | null

// Registered by the app so requests carry auth without the client importing the store.
let authTokenProvider: AuthTokenProvider | null = null

// Wires up (or clears, with null) the source of the bearer token for API requests.
export function setAuthTokenProvider(provider: AuthTokenProvider | null): void {
  authTokenProvider = provider
}

// Performs a fetch against the authoring API, handling auth, JSON headers, errors, and 204s.
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  // Only advertise a JSON body when we actually send one; don't clobber caller headers.
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // An explicit caller header wins, so callers can override the ambient session.
  if (!headers.has('Authorization')) {
    const token = authTokenProvider?.()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${apiBase()}${path}`, { ...init, headers })
  const method = init?.method ?? 'GET'

  if (!res.ok) {
    // Best-effort extraction of an { error, code?, detail? } body.
    let message = ''
    let code: string | undefined
    let detail: unknown
    try {
      const body = (await res.json()) as { error?: string; code?: string; detail?: unknown }
      if (body?.error) message = `: ${body.error}`
      code = body?.code
      detail = body?.detail
    } catch {
      // Non-JSON or empty error body; fall back to status only.
    }
    throw new ApiError(`${method} ${path} failed: ${res.status}${message}`, res.status, code, detail)
  }

  // 204 No Content carries no body to parse.
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
