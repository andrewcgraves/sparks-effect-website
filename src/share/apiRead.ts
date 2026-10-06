export type ApiRead = (path: string) => Promise<unknown>

// For the code Vercel runs on the server (middleware.ts, api/). Not apiRequest:
// that reads import.meta.env and the session store, neither of which exists
// there. These reads are always anonymous, so they only ever see public rows.
export function anonymousApiRead(base: string | undefined, timeoutMs: number): ApiRead {
  return async (path) => {
    if (!base) throw new Error('VITE_API_BASE_URL is not set')
    const res = await fetch(`${base}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`${path} answered ${res.status}`)
    return res.json()
  }
}
