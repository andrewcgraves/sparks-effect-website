// Shared HTTP helpers for the authoring API client.

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
export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
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
    // Best-effort extraction of an { error, code? } body.
    let detail = ''
    let code: string | undefined
    try {
      const body = (await res.json()) as { error?: string; code?: string }
      if (body?.error) detail = `: ${body.error}`
      code = body?.code
    } catch {
      // Non-JSON or empty error body; fall back to status only.
    }
    throw new ApiError(`${method} ${path} failed: ${res.status}${detail}`, res.status, code)
  }

  // 204 No Content carries no body to parse.
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
