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
