// Job status polling and result resolution.
import { apiRequest } from './client'
import type { Job } from './types'

// Fetches the current state of an async job.
export async function fetchJob(jobId: string): Promise<Job> {
  return apiRequest<Job>(`/api/jobs/${jobId}`)
}

// Options controlling pollJobToResult's cadence, timeout, and cancellation.
export interface PollJobOptions {
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
  onStatus?: (job: Job) => void
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

// Polls a job until it succeeds or fails/times out, resolving with the
// succeeded job itself — its `result` is the compiled TransitGraph. There is
// no separate fetch-by-slug: the compile endpoints embed the result directly
// on the job, so a caller already reading the graph reads it off this return
// value.
export async function pollJobToResult(jobId: string, options?: PollJobOptions): Promise<Job> {
  const intervalMs = options?.intervalMs ?? 1000
  const timeoutMs = options?.timeoutMs ?? 60000
  const signal = options?.signal
  const deadline = Date.now() + timeoutMs

  if (signal?.aborted) throw new Error('Polling aborted')

  // Poll immediately, then wait between subsequent polls.
  for (;;) {
    const job = await fetchJob(jobId)
    options?.onStatus?.(job)

    if (job.status === 'succeeded') {
      if (!job.result) {
        throw new Error(`Job ${jobId} succeeded but has no result`)
      }
      return job
    }

    if (job.status === 'failed') {
      throw new Error(`Job ${jobId} failed: ${job.error ?? 'unknown error'}`)
    }

    if (Date.now() >= deadline) {
      throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`)
    }

    await delay(intervalMs, signal)
  }
}
