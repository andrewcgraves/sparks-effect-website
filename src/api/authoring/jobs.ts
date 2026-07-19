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

// Polls a job until it succeeds (resolving its result via fetchResult) or fails/times out.
export async function pollJobToResult<T>(
  jobId: string,
  fetchResult: (slug: string) => Promise<T>,
  options?: PollJobOptions,
): Promise<T> {
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
      if (!job.result_slug) {
        throw new Error(`Job ${jobId} succeeded but has no result_slug`)
      }
      return fetchResult(job.result_slug)
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
