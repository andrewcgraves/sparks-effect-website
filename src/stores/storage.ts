// localStorage access shared by the stores that survive a reload.
//
// Every call here is best-effort. Storage can be disabled (private mode,
// blocked cookies) or full, and neither may break a session or an edit in
// flight — so failures leave the caller's in-memory state as the truth.

// Reads a stored JSON object, treating absent, unreadable, and corrupt entries
// alike: all three yield null. Fields are returned unvalidated, since only the
// caller knows which of them it can still use.
export function readJson<T>(key: string): Partial<T> | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    // A scalar or array can't carry the record shape every caller expects.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return parsed as Partial<T>
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or disabled; the caller keeps its state for this tab.
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
