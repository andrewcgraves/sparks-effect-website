// The queued -> running -> succeeded/failed poll, over any surface that reports
// work in those terms.
//
// Two surfaces do: compile jobs at /api/jobs (api/authoring/jobs) and routing
// jobs at /api/routing-jobs (api/routingJobs). The loop, its cadence, its
// deadline, and its abort handling are identical for both, and the only thing
// that differs is which endpoint answers — so that is the parameter, and there
// is one poller rather than two.

// Lifecycle state of an async job. Both surfaces speak this same vocabulary
// deliberately: a client polling either should not have to learn two spellings
// of the same four states.
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

// The minimum a polled job says about itself for the loop to know when to stop
// and what to report. Nothing else is read off it — what a succeeded job's
// result actually *is* belongs to the caller, which is why it is `unknown` here.
export interface PollableJob {
  id: string
  status: JobStatus
  result?: unknown
  error?: string | null
}

// Options controlling a poll's cadence, deadline, and cancellation.
export interface PollOptions<T> {
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
  onStatus?: (job: T) => void
}

/**
 * Thrown when a polled job answers `failed`. `jobError` is the API's own
 * `error` field, kept apart from `message` (which wraps it with the job id
 * for a log line) so a caller that has somewhere to show the user a reason —
 * the isochrone form's error banner, for one (SPA-230) — can show exactly what
 * the API said rather than inventing its own wording or a caller having to
 * re-parse `message` to get it back out.
 */
export class JobFailedError extends Error {
  readonly jobError: string | null

  constructor(jobId: string, jobError: string | null | undefined) {
    super(`Job ${jobId} failed: ${jobError ?? 'unknown error'}`)
    this.name = 'JobFailedError'
    this.jobError = jobError ?? null
  }
}

// Abortable delay so a signal abort short-circuits the wait instead of stalling.
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Polling aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Polling aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// Polls a job until it succeeds, or rejects when it fails, times out, or is
// aborted.
//
// It resolves with the job itself rather than just its result, because callers
// want both: the compile surface reads the graph off the returned job, and the
// jobs store mirrors the whole thing into reactive state. The return type
// narrows `result` to non-null, since a succeeded job without one is rejected
// here — that way no caller has to re-check what this already guaranteed.
export async function pollUntilSucceeded<T extends PollableJob>(
  jobId: string,
  fetchOne: (id: string) => Promise<T>,
  options?: PollOptions<T>,
): Promise<T & { result: NonNullable<T['result']> }> {
  const intervalMs = options?.intervalMs ?? 1000
  const timeoutMs = options?.timeoutMs ?? 60000
  const signal = options?.signal
  const deadline = Date.now() + timeoutMs

  if (signal?.aborted) throw new Error('Polling aborted')

  // Poll immediately, then wait between subsequent polls.
  for (;;) {
    const job = await fetchOne(jobId)
    options?.onStatus?.(job)

    if (job.status === 'succeeded') {
      if (job.result == null) {
        throw new Error(`Job ${jobId} succeeded but has no result`)
      }
      return job as T & { result: NonNullable<T['result']> }
    }

    if (job.status === 'failed') {
      throw new JobFailedError(jobId, job.error)
    }

    if (Date.now() >= deadline) {
      throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`)
    }

    await delay(intervalMs, signal)
  }
}
