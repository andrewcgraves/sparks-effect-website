export const SECURITY_HEADER_KEYS = [
  'Content-Security-Policy',
  'Content-Security-Policy-Report-Only',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'X-Frame-Options',
] as const

export function copySecurityHeaders(from: Headers, to: Headers): void {
  for (const key of SECURITY_HEADER_KEYS) {
    const value = from.get(key)
    if (value !== null) to.set(key, value)
  }
}

export interface VercelHeaderRule {
  source: string
  headers: { key: string; value: string }[]
}

export function catchAllCsp(rules: VercelHeaderRule[]): string | undefined {
  const catchAll = rules.find((rule) => rule.source === '/(.*)')
  return catchAll?.headers.find((h) => /^content-security-policy(-report-only)?$/i.test(h.key))?.value
}

export function cspDirectives(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) directives.set(name.toLowerCase(), sources)
  }
  return directives
}

export function apiOriginMissingFromCsp(rules: VercelHeaderRule[], apiBaseUrl: string | undefined): string | null {
  const base = apiBaseUrl?.trim()
  if (!base) return null
  let url: URL
  try {
    url = new URL(base)
  } catch {
    // A relative base is this origin, which 'self' covers.
    return null
  }
  const policy = catchAllCsp(rules)
  if (!policy) return null
  const directives = cspDirectives(policy)
  const sources = directives.get('connect-src') ?? directives.get('default-src') ?? []
  if (sources.includes(url.origin)) return null
  return (
    `VITE_API_BASE_URL's origin ${url.origin} is not in connect-src of vercel.json's Content-Security-Policy. ` +
    'Add it there, or the browser blocks every API call once the CSP is enforced.'
  )
}
