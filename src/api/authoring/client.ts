import { STOP_PLACEMENT_FAULT_KINDS } from './types'
import type { FaultedStop, StopPlacementFault } from './types'
import { TRACE_HEADER, newTraceId } from '../traceId'

export function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly detail?: unknown
  readonly retryAfterS?: number

  constructor(message: string, status: number, code?: string, detail?: unknown, retryAfterS?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
    this.retryAfterS = retryAfterS
  }
}

// Only the delta-seconds form: the API never sends an HTTP-date, and a value
// this cannot read is better left out than guessed at.
function retryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers?.get('Retry-After')?.trim()
  if (!raw || !/^\d+$/.test(raw)) return undefined
  return Number(raw)
}

// A 401 on a request sent with the session token: the session itself is gone,
// unlike a 401 without one (a wrong password at login). Still an ApiError(401),
// so authoringFault words it like any other expiry.
export class SessionExpiredError extends ApiError {
  constructor(message: string, code?: string, detail?: unknown) {
    super(message, 401, code, detail)
    this.name = 'SessionExpiredError'
  }
}

export function isSessionExpiry(err: unknown): boolean {
  return err instanceof SessionExpiredError
}

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

export type AuthTokenProvider = () => string | null

let authTokenProvider: AuthTokenProvider | null = null

export function setAuthTokenProvider(provider: AuthTokenProvider | null): void {
  authTokenProvider = provider
}

export type UnauthorizedHandler = (sentToken: string) => void

// Registered by the app, like the token provider, so the client reports a dead
// session without importing the store or the router.
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  // Only advertise a JSON body when we actually send one; don't clobber caller headers.
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // An explicit caller header wins, so callers can override the ambient session.
  // Only the ambient session's token is remembered: a 401 on anything else says
  // nothing about whether the session is still alive.
  let sessionToken: string | null = null
  if (!headers.has('Authorization')) {
    sessionToken = authTokenProvider?.() || null
    if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`)
  }

  // A fresh id per request unless the caller already set one — an
  // enqueue-then-poll job mints once and reuses it (see traceId.ts).
  if (!headers.has(TRACE_HEADER)) {
    headers.set(TRACE_HEADER, newTraceId())
  }

  const res = await fetch(`${apiBase()}${path}`, { ...init, headers })
  const method = init?.method ?? 'GET'

  if (!res.ok) {
    let message = ''
    let code: string | undefined
    let detail: unknown
    try {
      const body = (await res.json()) as { error?: string; code?: string; detail?: unknown }
      if (body?.error) message = `: ${body.error}`
      code = body?.code
      detail = body?.detail
    } catch {
      // Error responses are not always JSON.
    }
    const text = `${method} ${path} failed: ${res.status}${message}`
    if (res.status === 401 && sessionToken) {
      // Reported before the throw, so auth state is already cleared by the time
      // the caller's catch decides what to show.
      unauthorizedHandler?.(sessionToken)
      throw new SessionExpiredError(text, code, detail)
    }
    throw new ApiError(text, res.status, code, detail, retryAfterSeconds(res))
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
