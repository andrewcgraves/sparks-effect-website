// Shared HTTP helpers for the authoring API client.

// Resolves the API base URL, overridable via VITE_API_BASE_URL.
export function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
}

// Performs a fetch against the authoring API, handling JSON headers, errors, and 204s.
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  // Only advertise a JSON body when we actually send one; don't clobber caller headers.
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${apiBase()}${path}`, { ...init, headers })
  const method = init?.method ?? 'GET'

  if (!res.ok) {
    // Best-effort extraction of an { error } message from a JSON error body.
    let detail = ''
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) detail = `: ${body.error}`
    } catch {
      // Non-JSON or empty error body; fall back to status only.
    }
    throw new Error(`${method} ${path} failed: ${res.status}${detail}`)
  }

  // 204 No Content carries no body to parse.
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
