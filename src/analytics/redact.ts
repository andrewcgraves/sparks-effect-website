// A set-password link carries a one-time token that signs its holder in, so it
// must never reach an analytics store. Both the router's page views and Vercel's
// own <Analytics /> pass through here. Anything under /welcome/ is caught, so a
// mangled link that falls through to the not-found page is redacted too.
const SET_PASSWORD_PATH = /^\/welcome\/./

export function redactPath(path: string): string {
  return SET_PASSWORD_PATH.test(path) ? '/welcome' : path
}

export function redactUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  parsed.pathname = redactPath(parsed.pathname)
  parsed.searchParams.delete('token')
  return parsed.toString()
}

// An embed learns who frames it from the referrer, which can be a full URL
// with anything in its path and query; only the host is kept.
export function referrerHost(referrer: string): string | null {
  if (!referrer) return null
  try {
    return new URL(redactUrl(referrer)).hostname || null
  } catch {
    return null
  }
}
