// Compile job status polling and result resolution.
import { apiRequest } from './client'
import { pollUntilSucceeded, type PollOptions } from '../polling'
import { traceHeaders } from '../traceId'
import type { Job } from './types'

// Fetches the current state of an async job. `init` is how a compile reuses
// its trace id on every poll (SPA-205); one-shot callers omit it.
export async function fetchJob(jobId: string, init?: RequestInit): Promise<Job> {
  return apiRequest<Job>(`/api/jobs/${jobId}`, init)
}

// Options controlling pollJobToResult's cadence, timeout, and cancellation.
export type PollJobOptions = PollOptions<Job> & {
  // When set, every poll GET carries this as X-Trace-Id so a compile's
  // enqueue and its poll sequence share one id (SPA-205).
  traceId?: string
}

// Polls a job until it succeeds or fails/times out, resolving with the
// succeeded job itself — its `result` is the compiled TransitGraph. There is
// no separate fetch-by-slug: the compile endpoints embed the result directly
// on the job, so a caller already reading the graph reads it off this return
// value.
export function pollJobToResult(jobId: string, options?: PollJobOptions): Promise<Job> {
  const traceId = options?.traceId
  const fetchOne =
    traceId != null ? (id: string) => fetchJob(id, { headers: traceHeaders(traceId) }) : fetchJob
  return pollUntilSucceeded(jobId, fetchOne, options)
}
