const SAFE_ORIGIN = /^https?:\/\/[A-Za-z0-9.:[\]-]+$/

export function safeHttpOrigin(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // A quote or other markup in the origin would break out of the attribute.
    if (!SAFE_ORIGIN.test(url.origin)) return null
    return url.origin
  } catch {
    return null
  }
}
