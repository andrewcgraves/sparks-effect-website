/**
 * Counts attempts at something so a superseded one can be told to stay quiet.
 *
 * An authoring page is a form the user can resubmit before the last answer
 * lands, and requests already issued cannot be recalled — only ignored when
 * they arrive. Every async write to shared state therefore takes a number on
 * the way in and checks it on the way out.
 *
 * It is a counter rather than an AbortController because the point is not to
 * stop the work — a compile that is already running should still finish and
 * still be cached server-side — but to stop an older answer overwriting the one
 * the user is actually waiting on.
 */
export interface LatestAttempt {
  /** Takes the next number, making every earlier attempt stale. */
  begin: () => number
  /** Whether this attempt is still the one the caller is waiting on. */
  isCurrent: (attempt: number) => boolean
  /** Makes every attempt so far stale without starting one — how reset abandons work. */
  supersede: () => void
}

export function latestAttempt(): LatestAttempt {
  let current = 0
  return {
    begin: () => ++current,
    isCurrent: (attempt: number) => attempt === current,
    supersede: () => { current += 1 },
  }
}
