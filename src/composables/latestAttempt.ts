// An authoring page is a form the user can resubmit before the last answer
// lands, and requests already issued cannot be recalled — only ignored when
// they arrive. Every async write to shared state therefore takes a number on
// the way in and checks it on the way out.
//
// It is a counter rather than an AbortController because the point is not to
// stop the work — a compile that is already running should still finish and
// still be cached server-side — but to stop an older answer overwriting the one
// the user is actually waiting on.
export interface LatestAttempt {
  begin: () => number
  isCurrent: (attempt: number) => boolean
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
