import { redactPath } from '../analytics/redact'

const REDACTED = '[redacted]'

// Keys whose value is a credential whatever it looks like. Matched anywhere in
// the key (`sessionToken`, `new_password`): redacting a harmless field costs
// less than missing one.
const SECRET_KEY = /password|token|authorization|cookie|secret/i

const BEARER = /(bearer\s+)[^\s"',;]+/gi
const TOKEN_PARAM = /([?&]token=)[^&#\s"']+/gi
// A set-password link (`/welcome/<token>`) inside a URL or a message.
const WELCOME_PATH = /\/welcome\/[^\s"'?#]+/g
// The API path that reads and redeems that same token (`/api/auth/tokens/<token>`),
// which an API 5xx report names in its message and its `path`.
const TOKENS_PATH = /(\/tokens\/)[^\s"'?#/]+/g

function scrubString(value: string, secrets: readonly string[]): string {
  let out = value
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join(REDACTED)
  }
  return out
    .replace(BEARER, `$1${REDACTED}`)
    .replace(TOKEN_PARAM, `$1${REDACTED}`)
    .replace(WELCOME_PATH, (path) => redactPath(path))
    .replace(TOKENS_PATH, `$1${REDACTED}`)
}

function scrub(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') return scrubString(value, secrets)
  if (Array.isArray(value)) return value.map((v) => scrub(v, secrets))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) && v != null ? REDACTED : scrub(v, secrets)
    }
    return out
  }
  return value
}

// The error tracker's beforeSend. Every string in the outgoing item is walked,
// not just the error message: Faro attaches the page URL, the view, and any
// context a report was given, and a credential can reach any of them. `secrets`
// are literal values to remove wherever they appear, i.e. the session token
// held in `sparks-effect.auth`, which is not always sent with a Bearer prefix.
export function scrubItem<T>(item: T, secrets: readonly string[]): T {
  return scrub(item, secrets) as T
}
