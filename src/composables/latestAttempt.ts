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
